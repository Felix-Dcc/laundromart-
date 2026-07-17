/**
 * Canonical order serializer.
 *
 * ONE shape returned to every client (user / rider / provider / admin).
 * Screens must not re-derive status meaning — they read these fields.
 *
 * Pass the requester's role to get the `allowedActions` they may perform.
 */
const sm = require('../services/orderStateMachine');

// Prisma include needed to fully shape an order. Reuse everywhere so the
// serializer never hits an undefined relation.
const ORDER_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true } },
  provider: {
    select: {
      id: true, firstName: true, lastName: true, businessName: true,
      address: true, phone: true, latitude: true, longitude: true,
      avgRating: true, reviewCount: true, businessHours: true,
    },
  },
  assignedRider: { select: { id: true, firstName: true, lastName: true, phone: true, latitude: true, longitude: true, lastLocationUpdate: true } },
  deliveryRider: { select: { id: true, firstName: true, lastName: true, phone: true, latitude: true, longitude: true, lastLocationUpdate: true } },
  statusHistory: {
    include: { user: { select: { firstName: true, lastName: true, userType: true } } },
    orderBy: { createdAt: 'asc' },
  },
};

function shapeProvider(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.businessName || `${p.firstName} ${p.lastName}'s Laundry`,
    address: p.address,
    phone: p.phone,
    latitude: p.latitude,
    longitude: p.longitude,
    rating: p.avgRating || 0,
    reviewCount: p.reviewCount || 0,
    businessHours: p.businessHours || null,
  };
}

function shapeRider(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: `${r.firstName} ${r.lastName}`,
    phone: r.phone,
    latitude: r.latitude,
    longitude: r.longitude,
    lastLocationUpdate: r.lastLocationUpdate || null,
  };
}

// One timeline vocabulary for every screen.
function shapeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((h) => ({
    status: h.status,
    label: sm.labelFor(h.status),
    notes: h.notes || null,
    at: h.createdAt,
    by: h.user ? { name: `${h.user.firstName} ${h.user.lastName}`, role: h.user.userType } : null,
  }));
}

function computeEta(order) {
  if (!order.etaMinutes || !order.estimatedCompletion) return null;
  if (sm.isTerminal(order.status)) return null;
  const remainingMs = new Date(order.estimatedCompletion) - new Date();
  return {
    etaMinutes: order.etaMinutes,
    estimatedCompletion: order.estimatedCompletion,
    remainingMinutes: Math.max(0, Math.round(remainingMs / 60000)),
    isOverdue: remainingMs < 0,
  };
}

/**
 * Shape a single prisma order (loaded with ORDER_INCLUDE) into the canonical
 * client object. `role` tailors the allowedActions list to the requester.
 */
function shapeOrder(order, { role = null } = {}) {
  if (!order) return null;
  const meta = sm.STATUS_META[order.status] || { label: order.status, phase: 'unknown' };
  return {
    id: order.id,
    requestNumber: order.requestNumber,

    // ── Single authoritative status ──
    status: order.status,
    statusLabel: meta.label,
    phase: meta.phase,
    stepIndex: sm.stepIndex(order.status),
    totalSteps: sm.MAINLINE.length,
    isTerminal: sm.isTerminal(order.status),
    allowedActions: role ? sm.allowedActionsFor(order.status, role) : [],

    // ── Order details ──
    laundryType: order.laundryType,
    weightKg: order.weightKg,
    totalAmount: order.totalAmount,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,

    // ── Verified pricing breakdown ──
    // Estimate (quote) vs final (after the provider weighs the laundry).
    estimatedWeightKg: order.weightKg,
    actualWeightKg: order.actualWeightKg,
    estimatedAmount: order.totalAmount,
    finalAmount: order.finalAmount,
    // Promo redemption
    promoCode: order.promoCode || null,
    promoDiscount: order.promoDiscount != null ? Number(order.promoDiscount) : 0,
    // The amount the customer actually owes: (final once verified, else estimate)
    // minus any promo discount, never below zero.
    amountDue: Math.max(0, Number(order.finalAmount != null ? order.finalAmount : order.totalAmount) - Number(order.promoDiscount || 0)),
    weightVerified: order.finalAmount != null || order.weightVerifiedAt != null,
    weightVerifiedAt: order.weightVerifiedAt || null,
    priceDifference: order.finalAmount != null ? Number(order.finalAmount) - Number(order.totalAmount) : null,
    pricePerKg: Number(order.weightKg) > 0 ? Math.round((Number(order.totalAmount) / Number(order.weightKg)) * 100) / 100 : null,
    specialInstructions: order.specialInstructions,
    adminNotes: order.adminNotes,

    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime,
    pickupAddress: order.pickupAddress,
    deliveryAddress: order.deliveryAddress,

    pickupLatitude: order.pickupLatitude,
    pickupLongitude: order.pickupLongitude,
    laundromatLatitude: order.laundromatLatitude,
    laundromatLongitude: order.laundromatLongitude,

    // ── Parties ──
    user: order.user
      ? { id: order.user.id, name: `${order.user.firstName} ${order.user.lastName}`, firstName: order.user.firstName, lastName: order.user.lastName, phone: order.user.phone, email: order.user.email, address: order.user.address }
      : null,
    provider: shapeProvider(order.provider),
    assignedRider: shapeRider(order.assignedRider),
    deliveryRider: shapeRider(order.deliveryRider),

    // ── Timeline + ETA ──
    statusHistory: shapeHistory(order.statusHistory),
    eta: computeEta(order),

    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

module.exports = { ORDER_INCLUDE, shapeOrder, shapeProvider, shapeRider, shapeHistory };
