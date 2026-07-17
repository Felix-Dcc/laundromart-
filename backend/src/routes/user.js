const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { authenticate, requireUser } = require('../middleware/auth');
const { sendNotification } = require('../services/notification');
const { ORDER_INCLUDE, shapeOrder } = require('../lib/orderShape');

const router = express.Router();
const prisma = require('../lib/prisma');

// Lifecycle groupings on the single OrderStatus.
const OPEN_STATUSES = ['created', 'awaiting_rider'];
const IN_PROCESS_STATUSES = [
  'rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up',
  'at_laundromat', 'preparing', 'washing', 'drying', 'ironing',
  'ready_for_delivery', 'delivery_rider_assigned', 'out_for_delivery', 'delivered',
];

// All routes require authentication; dashboard is user-only, profile is open to all roles
router.use(authenticate);

// GET /api/user/dashboard - Dashboard statistics (mirrors user/dashboard.php)
router.get('/dashboard', requireUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      totalRequests,
      pendingRequests,
      inProcessRequests,
      completedRequests,
      totalSpentResult,
      recentRequests,
      recentNotifications,
    ] = await Promise.all([
      prisma.laundryRequest.count({ where: { userId } }),
      prisma.laundryRequest.count({ where: { userId, status: { in: OPEN_STATUSES } } }),
      prisma.laundryRequest.count({ where: { userId, status: { in: IN_PROCESS_STATUSES } } }),
      prisma.laundryRequest.count({ where: { userId, status: 'completed' } }),
      prisma.laundryRequest.aggregate({
        where: { userId, paymentStatus: 'paid' },
        _sum: { totalAmount: true },
      }),
      prisma.laundryRequest.findMany({
        where: { userId },
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    res.json({
      stats: {
        totalRequests,
        pendingRequests,
        inProcessRequests,
        completedRequests,
        totalSpent: totalSpentResult._sum.totalAmount || 0,
      },
      recentRequests: recentRequests.map((r) => shapeOrder(r, { role: 'user' })),
      recentNotifications,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
});

// GET /api/user/profile - Get user profile (mirrors user/profile.php GET)
router.get('/profile', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        address: true,
        userType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// PUT /api/user/profile - Update profile (mirrors user/profile.php POST update_profile)
router.put('/profile', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address } = req.body;

    // Validation
    const errors = [];
    if (!firstName || !firstName.trim()) errors.push('First name is required.');
    if (!lastName || !lastName.trim()) errors.push('Last name is required.');
    if (!email || !email.trim()) errors.push('Email is required.');
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('Please enter a valid email address.');
    if (!phone || !phone.trim()) errors.push('Phone number is required.');
    else if (!/^[0-9+\-\s()]+$/.test(phone)) errors.push('Please enter a valid phone number.');
    if (!address || !address.trim()) errors.push('Address is required.');

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Check if email is taken by another user
    if (email.trim().toLowerCase() !== req.user.email) {
      const existing = await prisma.user.findFirst({
        where: { email: email.trim().toLowerCase(), id: { not: req.user.id } },
      });
      if (existing) {
        return res.status(400).json({ errors: ['Email address is already taken by another user.'] });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        address: true,
        userType: true,
        status: true,
      },
    });

    await sendNotification(req.user.id, 'Profile Updated', 'Your profile information has been updated successfully.', 'success');

    res.json({ message: 'Profile updated successfully!', user: updatedUser });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ errors: ['Failed to update profile. Please try again.'] });
  }
});

// PUT /api/user/change-password - Change password (mirrors user/profile.php POST change_password)
router.put('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    const errors = [];
    if (!currentPassword) errors.push('Current password is required.');
    if (!newPassword) errors.push('New password is required.');
    else if (newPassword.length < config.app.passwordMinLength) {
      errors.push(`New password must be at least ${config.app.passwordMinLength} characters long.`);
    }
    if (newPassword !== confirmPassword) errors.push('New passwords do not match.');

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Verify current password
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ errors: ['Current password is incorrect.'] });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    await sendNotification(req.user.id, 'Password Changed', 'Your password has been changed successfully.', 'success');

    res.json({ message: 'Password changed successfully!' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ errors: ['Failed to change password. Please try again.'] });
  }
});

module.exports = router;
