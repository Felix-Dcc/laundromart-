const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { sendNotification, registerDeviceToken, removeDeviceToken } = require('../services/notification');
const { authenticate } = require('../middleware/auth');
const { signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken } = require('../services/token');

const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * Verify a reCAPTCHA v3 token with Google. Returns { ok, reason }.
 * Skipped entirely when no secret is configured, or when no token is sent
 * (e.g. the mobile app), so existing clients keep working.
 */
async function verifyRecaptcha(token, remoteIp) {
  if (!config.security.recaptchaSecret) return { ok: true, skipped: true };
  if (!token) return { ok: true, skipped: true }; // client without reCAPTCHA (mobile)
  try {
    const params = new URLSearchParams({ secret: config.security.recaptchaSecret, response: token });
    if (remoteIp) params.append('remoteip', remoteIp);
    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
    });
    const data = await resp.json();
    if (!data.success) return { ok: false, reason: 'reCAPTCHA failed. Please try again.' };
    if (typeof data.score === 'number' && data.score < config.security.recaptchaMinScore) {
      return { ok: false, reason: 'Suspicious activity detected. Please try again.' };
    }
    return { ok: true, score: data.score };
  } catch (e) {
    // Don't lock users out if Google is unreachable — fail open, but log it.
    console.error('reCAPTCHA verify error:', e.message);
    return { ok: true, degraded: true };
  }
}

// POST /api/auth/register - User registration (mirrors register.php)
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address, password } = req.body;

    // Validation (mirrors PHP validation)
    const errors = [];
    if (!firstName || !firstName.trim()) errors.push('First name is required.');
    if (!lastName || !lastName.trim()) errors.push('Last name is required.');
    if (!email || !email.trim()) errors.push('Email is required.');
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('Please enter a valid email address.');
    if (!phone || !phone.trim()) errors.push('Phone number is required.');
    else if (!/^[0-9+\-\s()]+$/.test(phone)) errors.push('Please enter a valid phone number.');
    if (!address || !address.trim()) errors.push('Address is required.');
    if (!password) errors.push('Password is required.');
    else if (password.length < config.app.passwordMinLength) {
      errors.push(`Password must be at least ${config.app.passwordMinLength} characters long.`);
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ errors: ['Email address is already registered.'] });
    }

    // Create user account
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        password: hashedPassword,
        userType: 'user',
      },
    });

    // Send welcome notification
    await sendNotification(
      user.id,
      `Welcome to ${config.app.name}`,
      'Your account has been created successfully. You can now start using our laundry services.',
      'success'
    );

    res.status(201).json({
      message: 'Registration successful! You can now login to your account.',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ errors: ['Registration failed. Please try again.'] });
  }
});

// Record a login attempt (best-effort, never blocks the response).
function recordLoginAttempt(req, email, userId, success) {
  prisma.loginAttempt.create({
    data: {
      email: (email || '').trim().toLowerCase().slice(0, 100),
      userId: userId || null,
      success,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: req.get?.('user-agent') || null,
    },
  }).catch(() => {});
}

// POST /api/auth/login - User/Provider/Admin login (mirrors login.php + admin/login.php)
router.post('/login', async (req, res) => {
  try {
    const { email, password, fcmToken, twofaToken, recaptchaToken } = req.body;

    // Validation
    const errors = [];
    if (!email) errors.push('Email is required.');
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('Please enter a valid email address.');
    if (!password) errors.push('Password is required.');

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Bot protection (reCAPTCHA v3) — no-op unless a secret + token are present.
    const captcha = await verifyRecaptcha(recaptchaToken, req.ip);
    if (!captcha.ok) {
      recordLoginAttempt(req, email, undefined, false);
      return res.status(400).json({ errors: [captcha.reason] });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      recordLoginAttempt(req, email, user?.id, false);
      return res.status(401).json({ errors: ['Invalid email or password.'] });
    }

    if (user.status !== 'active') {
      recordLoginAttempt(req, email, user.id, false);
      return res.status(403).json({ errors: ['Your account has been deactivated. Please contact support.'] });
    }

    // Two-factor gate (admins who opted in). Password is correct at this point;
    // require a valid TOTP before issuing tokens.
    if (user.twofaEnabled && user.twofaSecret) {
      if (!twofaToken) {
        return res.status(401).json({ twofaRequired: true, errors: ['Enter your authenticator code to continue.'] });
      }
      const otp = require('otplib');
      if (!otp.verifySync({ token: String(twofaToken), secret: user.twofaSecret }).valid) {
        recordLoginAttempt(req, email, user.id, false);
        return res.status(401).json({ twofaRequired: true, errors: ['Invalid authenticator code.'] });
      }
    }

    recordLoginAttempt(req, email, user.id, true);

    // Update FCM token if provided
    if (fcmToken) {
      await prisma.user.update({
        where: { id: user.id },
        data: { fcmToken },
      });
    }

    // Generate a short-lived access token + a rotating refresh token.
    const token = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);

    // Send login notification
    await sendNotification(user.id, 'Login Successful', 'You have successfully logged into your account.', 'info');

    res.json({
      message: 'Login successful.',
      token,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        userType: user.userType,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ errors: ['Login failed. Please try again.'] });
  }
});

// POST /api/auth/forgot-password - Password reset request (mirrors forgot-password.php)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ errors: ['Please enter a valid email address.'] });
    }

    const user = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), status: 'active' },
    });

    if (user) {
      // Generate reset token
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpires: resetExpires },
      });

      await sendNotification(
        user.id,
        'Password Reset Request',
        'A password reset request has been made for your account. If this was not you, please contact support.',
        'warning'
      );
    }

    // Always return success (don't reveal if email exists)
    res.json({
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ errors: ['An error occurred. Please try again.'] });
  }
});

// POST /api/auth/refresh - Exchange a refresh token for a new access token.
// Rotates the refresh token (old one is revoked). No auth header needed —
// the refresh token itself is the credential.
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const result = await rotateRefreshToken(refreshToken);
    if (result.error) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { id: true, userType: true, status: true },
    });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    res.json({ token: signAccessToken(user), refreshToken: result.refreshToken });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh session.' });
  }
});

// POST /api/auth/logout - Revoke the supplied refresh token.
router.post('/logout', async (req, res) => {
  try {
    await revokeRefreshToken(req.body.refreshToken);
    res.json({ message: 'Logged out.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.json({ message: 'Logged out.' }); // logout should never hard-fail the client
  }
});

// GET /api/auth/me - Get current user profile
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/fcm-token - Register/refresh this device's push token.
// Supports multiple devices per account (DeviceToken table) and keeps the
// legacy user.fcmToken for backward compatibility.
router.put('/fcm-token', authenticate, async (req, res) => {
  try {
    const { fcmToken, platform } = req.body;
    if (!fcmToken) return res.status(400).json({ error: 'fcmToken is required.' });

    await Promise.all([
      prisma.user.update({ where: { id: req.user.id }, data: { fcmToken } }),
      registerDeviceToken(req.user.id, fcmToken, platform),
    ]);
    res.json({ message: 'Device token registered.' });
  } catch (error) {
    console.error('FCM token update error:', error);
    res.status(500).json({ error: 'Failed to register device token.' });
  }
});

// DELETE /api/auth/fcm-token - Unregister this device (e.g. on logout).
router.delete('/fcm-token', authenticate, async (req, res) => {
  try {
    const token = req.body.fcmToken || req.query.fcmToken;
    if (token) await removeDeviceToken(token);
    res.json({ message: 'Device token removed.' });
  } catch (error) {
    console.error('FCM token remove error:', error);
    res.status(500).json({ error: 'Failed to remove device token.' });
  }
});

module.exports = router;
