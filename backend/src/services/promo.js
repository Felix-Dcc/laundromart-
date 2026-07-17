/**
 * Promo-code redemption — the single source of truth for validating a code and
 * computing its discount. Used by the order-create + weight-verify flows and by
 * the customer "validate code" endpoint so the app preview matches the charge.
 */
const prisma = require('../lib/prisma');

// Look up an active, in-window, not-exhausted promo. Returns the row or null.
async function findValidPromo(code) {
  if (!code || !String(code).trim()) return null;
  const promo = await prisma.promotion.findUnique({ where: { code: String(code).trim().toUpperCase().replace(/\s+/g, '') } });
  if (!promo || !promo.active) return null;
  const now = new Date();
  if (promo.startsAt && promo.startsAt > now) return null;
  if (promo.expiresAt && promo.expiresAt < now) return null;
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) return null;
  return promo;
}

// Discount amount for a given subtotal (never exceeds the subtotal).
function discountFor(promo, subtotal) {
  const amount = Number(subtotal) || 0;
  if (!promo) return 0;
  if (promo.minOrder && amount < Number(promo.minOrder)) return null; // signals "min not met"
  const raw = promo.type === 'percent' ? amount * (Number(promo.value) / 100) : Number(promo.value);
  return Math.min(amount, Math.round(raw * 100) / 100);
}

/**
 * Validate a code against a subtotal.
 * @returns {{ ok, code, discount, total, reason?, minOrder?, type?, value? }}
 */
async function quote(code, subtotal) {
  const amount = Number(subtotal) || 0;
  const promo = await findValidPromo(code);
  if (!promo) return { ok: false, reason: 'Invalid or expired promo code.' };
  const discount = discountFor(promo, amount);
  if (discount === null) return { ok: false, reason: `Minimum order of GHS ${Number(promo.minOrder).toFixed(2)} required.`, minOrder: Number(promo.minOrder) };
  return {
    ok: true, code: promo.code, type: promo.type, value: Number(promo.value),
    discount, total: Math.round((amount - discount) * 100) / 100,
  };
}

// Increment usage after a code is successfully applied to an order (best-effort).
async function markUsed(code) {
  if (!code) return;
  await prisma.promotion.updateMany({
    where: { code: String(code).trim().toUpperCase().replace(/\s+/g, '') },
    data: { usedCount: { increment: 1 } },
  }).catch(() => {});
}

module.exports = { findValidPromo, discountFor, quote, markUsed };
