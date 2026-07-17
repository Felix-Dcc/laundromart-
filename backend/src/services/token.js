/**
 * Access + refresh token service.
 *
 * - Access token: short-lived JWT ({ userId, userType }), verified by the
 *   `authenticate` middleware (unchanged).
 * - Refresh token: long-lived, OPAQUE random string. Only its SHA-256 hash is
 *   stored, so a DB leak can't be replayed. Rotated on every use (old one
 *   revoked, new one issued) and revocable (logout / admin). Presenting an
 *   already-revoked token triggers a full revocation of the user's tokens
 *   (reuse = likely theft).
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../lib/prisma');

function signAccessToken(user) {
  return jwt.sign(
    { userId: user.id, userType: user.userType },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn },
  );
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + config.jwt.refreshExpiresDays * 86400000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt },
  });
  return raw;
}

/**
 * Validate + rotate. Returns { userId, refreshToken } on success, or
 * { error: 'invalid'|'reuse'|'expired' }.
 */
async function rotateRefreshToken(raw) {
  if (!raw) return { error: 'invalid' };
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!existing) return { error: 'invalid' };

  if (existing.revokedAt) {
    // Reuse of a revoked token → possible theft: revoke everything for the user.
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { error: 'reuse' };
  }
  if (existing.expiresAt < new Date()) return { error: 'expired' };

  // Rotate: revoke the presented token, mint a fresh one.
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  const refreshToken = await issueRefreshToken(existing.userId);
  return { userId: existing.userId, refreshToken };
}

async function revokeRefreshToken(raw) {
  if (!raw) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = { signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken };
