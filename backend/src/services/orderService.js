/**
 * ============================================================
 * ORDER SERVICE — the ONLY place order status is mutated.
 * ============================================================
 * Every status change (rider, provider, admin, user, system) goes through
 * transitionOrder(). It:
 *   1. validates the transition against the state machine,
 *   2. validates the actor's role is allowed to make it,
 *   3. applies it atomically with a guard on the current status
 *      (kills races, double-taps, and skipped steps — 0 rows => reject),
 *   4. writes a typed status-history row,
 *   5. runs status-driven side effects (rider assignment, earnings),
 *   6. after commit: emits realtime, sends notifications, recalculates ETA,
 *      writes the audit log.
 *
 * Controllers stay thin: authenticate, then call one of these functions.
 */
const prisma = require('../lib/prisma');
const sm = require('./orderStateMachine');
const { ORDER_INCLUDE, shapeOrder } = require('../lib/orderShape');

// Flat earnings per completed leg (kept simple; make configurable later).
const PICKUP_EARNINGS = 10.0;
const DELIVERY_EARNINGS = 10.0;

// Typed error the routes translate into HTTP responses.
class TransitionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Core transition. Runs inside a transaction with a status-guarded update.
 *
 * @param {Object}   p
 * @param {number}   p.orderId
 * @param {string}   p.to           target OrderStatus
 * @param {Object}   p.actor        { id, role, name }  (role drives permission; id is a real user id for history)
 * @param {string?}  p.notes
 * @param {Object}   p.extraData    extra columns to set on the order (e.g. assignedRiderId)
 * @param {Object}   p.guardWhere   extra WHERE conditions the update must satisfy (e.g. assignedRiderId: null)
 * @param {Object?}  p.req          express req (for audit ip/user-agent)
 * @returns {Promise<Object>}       canonical shaped order (tailored to actor.role)
 */
async function transitionOrder({ orderId, to, actor, notes = null, extraData = {}, guardWhere = {}, req = null }) {
  if (!actor || !actor.id || !actor.role) throw new TransitionError('NO_ACTOR', 'Actor is required.', 400);
  if (!sm.isValidStatus(to)) throw new TransitionError('BAD_STATUS', `Unknown status "${to}".`, 400);

  const { order: raw, from } = await prisma.$transaction(async (tx) => {
    const current = await tx.laundryRequest.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, userId: true, assignedRiderId: true, deliveryRiderId: true, providerId: true, requestNumber: true, paymentStatus: true },
    });
    if (!current) throw new TransitionError('NOT_FOUND', 'Order not found.', 404);

    const from = current.status;

    if (from === to) throw new TransitionError('DUPLICATE', `Order is already "${sm.labelFor(to)}".`, 409);
    if (!sm.canTransition(from, to)) {
      throw new TransitionError('INVALID_TRANSITION', `Cannot move from "${sm.labelFor(from)}" to "${sm.labelFor(to)}".`, 409);
    }
    if (!sm.canActorSet(actor.role, to, from)) {
      throw new TransitionError('FORBIDDEN', `Your role is not allowed to set "${sm.labelFor(to)}".`, 403);
    }

    // ── PAYMENT GATE ──
    // Washing cannot begin until the customer has paid the verified amount.
    // The single choke-point: weight_verified → preparing requires payment.
    if (to === 'preparing' && current.paymentStatus !== 'paid') {
      throw new TransitionError('PAYMENT_REQUIRED', 'Payment must be completed before washing can begin.', 402);
    }

    // Atomic guard: only update if the status is still what we validated
    // (and any extra guard like "no rider yet" still holds).
    const updated = await tx.laundryRequest.updateMany({
      where: { id: orderId, status: from, ...guardWhere },
      data: { status: to, ...extraData },
    });
    if (updated.count === 0) {
      throw new TransitionError('CONFLICT', 'This order was just updated by someone else. Please refresh.', 409);
    }

    // Typed, single-vocabulary history row.
    await tx.requestStatusHistory.create({
      data: { requestId: orderId, status: to, notes, changedBy: actor.id },
    });

    // ── status-driven side effects (inside the same transaction) ──
    await applySideEffects(tx, { orderId, to, current });

    const order = await tx.laundryRequest.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    return { order, from };
  });

  // ── post-commit (best-effort; never rolls back the transition) ──
  await afterTransition(raw, from, to, actor, req);

  return shapeOrder(raw, { role: actor.role });
}

// Side effects that must be part of the same transaction as the status change.
async function applySideEffects(tx, { orderId, to, current }) {
  if (to === 'at_laundromat') {
    // Pickup leg complete → credit the pickup rider.
    if (current.assignedRiderId) {
      await tx.user.update({
        where: { id: current.assignedRiderId },
        data: { totalPickups: { increment: 1 }, totalEarnings: { increment: PICKUP_EARNINGS } },
      });
      await tx.riderAssignment.updateMany({
        where: { orderId }, data: { pickedUpAt: new Date(), riderEarnings: { increment: PICKUP_EARNINGS } },
      });
    }
  } else if (to === 'completed') {
    // Delivery leg complete → credit the delivery rider (falls back to pickup rider).
    const rid = current.deliveryRiderId || current.assignedRiderId;
    if (rid) {
      await tx.user.update({
        where: { id: rid },
        data: { totalEarnings: { increment: DELIVERY_EARNINGS } },
      });
      await tx.riderAssignment.updateMany({ where: { orderId }, data: { deliveredAt: new Date() } });
    }
  }
}

// Realtime + notifications + ETA + audit. Lazily required to avoid load-order cycles.
async function afterTransition(order, from, to, actor, req) {
  try {
    const { emitOrderTransition } = require('./realtime');
    emitOrderTransition(order, { from, to });
  } catch (e) { console.error('[orderService] realtime emit failed:', e.message); }

  try {
    const { notifyStatusChange } = require('./notification');
    await notifyStatusChange(order, to, actor);
  } catch (e) { console.error('[orderService] notify failed:', e.message); }

  try {
    const { updateOrderETA } = require('./eta');
    await updateOrderETA(order.id);
  } catch (e) { console.error('[orderService] eta failed:', e.message); }

  try {
    const { logOrderStatusChange } = require('./audit');
    await logOrderStatusChange(order, from, to, actor.id, req);
  } catch (e) { console.error('[orderService] audit failed:', e.message); }
  // NOTE: freeing riders on cancel is handled in cancelOrder() where the
  // pre-update rider snapshot is still available.
}

// ============================================================
// High-level wrappers used by routes
// ============================================================

/** System auto-advance created → awaiting_rider (right after creation). */
async function publishNewOrder(orderId, customerId, req = null) {
  return transitionOrder({
    orderId, to: 'awaiting_rider',
    actor: { id: customerId, role: 'system', name: 'System' },
    notes: 'Order published to available riders.', req,
  });
}

/** Rider accepts a pickup: awaiting_rider → rider_assigned (atomic, first-come). */
async function acceptPickup({ orderId, rider, req = null }) {
  const shaped = await transitionOrder({
    orderId, to: 'rider_assigned',
    actor: { id: rider.id, role: 'rider', name: `${rider.firstName} ${rider.lastName}` },
    notes: 'Rider accepted the pickup.',
    extraData: { assignedRiderId: rider.id },
    guardWhere: { assignedRiderId: null }, // reject if another rider already took it
    req,
  });
  // Track assignment metadata (best-effort).
  await prisma.riderAssignment.upsert({
    where: { orderId },
    update: { riderId: rider.id, acceptedAt: new Date(), rejectedAt: null },
    create: { orderId, riderId: rider.id, acceptedAt: new Date() },
  }).catch(() => {});
  return shaped;
}

/**
 * Provider verifies the ACTUAL laundry weight → computes the final amount on
 * the server and moves the order to weight_verified (awaiting payment).
 * Only the order's own provider (or super admin) may verify, only once, only
 * before payment, and only right after the laundry arrived at the laundromat.
 */
async function verifyWeight({ orderId, actor, actualWeightKg, req = null }) {
  const { calculateLaundryCost } = require('./order');

  const weight = parseFloat(actualWeightKg);
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new TransitionError('BAD_WEIGHT', 'Actual weight must be greater than 0.', 400);
  }
  if (weight > 50) throw new TransitionError('BAD_WEIGHT', 'Actual weight cannot exceed 50 kg.', 400);

  const order = await prisma.laundryRequest.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, providerId: true, laundryType: true, weightKg: true, totalAmount: true, paymentStatus: true, promoCode: true },
  });
  if (!order) throw new TransitionError('NOT_FOUND', 'Order not found.', 404);

  // Only the assigned provider (or super admin) may verify.
  const isOwner = actor.role === 'provider' && order.providerId === actor.id;
  if (!isOwner && actor.role !== 'superadmin') {
    throw new TransitionError('FORBIDDEN', 'Only the assigned laundromat can verify the weight.', 403);
  }
  if (order.status !== 'at_laundromat') {
    throw new TransitionError('INVALID_STATE', 'Weight can only be verified once the laundry has arrived at the laundromat.', 409);
  }
  if (order.paymentStatus === 'paid') {
    throw new TransitionError('ALREADY_PAID', 'The weight cannot be changed after payment.', 409);
  }

  // Final price is ALWAYS computed on the server from the active pricing table.
  let finalAmount = await calculateLaundryCost(order.laundryType, weight);
  // Fallback: derive per-kg rate from the original estimate if pricing is missing.
  if (!finalAmount && Number(order.weightKg) > 0) {
    finalAmount = (Number(order.totalAmount) / Number(order.weightKg)) * weight;
  }
  finalAmount = Math.round(finalAmount * 100) / 100;

  // Re-apply the promo against the FINAL amount so percentage codes scale
  // correctly (a 10% code now discounts the verified total, not the estimate).
  let extraData = { actualWeightKg: weight, finalAmount, weightVerifiedAt: new Date() };
  if (order.promoCode) {
    const q = await require('./promo').quote(order.promoCode, finalAmount);
    // If the code is still valid, refresh the discount; otherwise clear it.
    extraData.promoDiscount = q.ok ? q.discount : 0;
    if (!q.ok) extraData.promoCode = null;
  }

  const notes = `Actual weight verified: ${weight} kg. Final total: ${finalAmount.toFixed(2)}.`;
  return transitionOrder({
    orderId, to: 'weight_verified', actor, notes, extraData, req,
  });
}

/** Rider accepts a delivery: ready_for_delivery → delivery_rider_assigned. */
async function acceptDelivery({ orderId, rider, req = null }) {
  return transitionOrder({
    orderId, to: 'delivery_rider_assigned',
    actor: { id: rider.id, role: 'rider', name: `${rider.firstName} ${rider.lastName}` },
    notes: 'Rider accepted the delivery.',
    extraData: { deliveryRiderId: rider.id },
    guardWhere: { deliveryRiderId: null },
    req,
  });
}

/**
 * Rider declines an available delivery. Records the decline so the order
 * disappears from THIS rider's pool but stays available to everyone else.
 */
async function declineDelivery({ orderId, riderId }) {
  const order = await prisma.laundryRequest.findUnique({
    where: { id: orderId }, select: { status: true, deliveryRiderId: true },
  });
  if (!order) throw new TransitionError('NOT_FOUND', 'Order not found.', 404);
  if (order.status !== 'ready_for_delivery' || order.deliveryRiderId) {
    throw new TransitionError('UNAVAILABLE', 'This delivery is no longer available.', 409);
  }
  await prisma.deliveryDecline.upsert({
    where: { orderId_riderId: { orderId, riderId } },
    update: {},
    create: { orderId, riderId },
  });
  return { ok: true };
}

/** Rider marks delivered → also auto-completes the order. */
async function markDelivered({ orderId, rider, req = null }) {
  const actor = { id: rider.id, role: 'rider', name: `${rider.firstName} ${rider.lastName}` };
  await transitionOrder({ orderId, to: 'delivered', actor, notes: 'Delivered to customer.', req });
  // System auto-completion (kept as a distinct, visible step).
  return transitionOrder({
    orderId, to: 'completed',
    actor: { id: rider.id, role: 'system', name: 'System' },
    notes: 'Order completed.', req,
  });
}

/** Cancel by user / admin / superadmin. Frees any assigned riders. */
async function cancelOrder({ orderId, actor, notes = null, req = null }) {
  // Snapshot riders before we clear them so we can put them back online.
  const before = await prisma.laundryRequest.findUnique({
    where: { id: orderId }, select: { assignedRiderId: true, deliveryRiderId: true },
  });

  const shaped = await transitionOrder({
    orderId, to: 'cancelled', actor, notes: notes || 'Order cancelled.',
    extraData: { assignedRiderId: null, deliveryRiderId: null }, req,
  });

  const freed = [before?.assignedRiderId, before?.deliveryRiderId].filter(Boolean);
  if (freed.length) {
    await prisma.user.updateMany({ where: { id: { in: freed } }, data: { riderStatus: 'online' } }).catch(() => {});
  }
  return shaped;
}

/** Admin/superadmin reassigns the pickup rider to another rider. */
async function reassignRider({ orderId, newRiderId, actor, req = null }) {
  const order = await prisma.laundryRequest.findUnique({
    where: { id: orderId }, select: { id: true, status: true, assignedRiderId: true },
  });
  if (!order) throw new TransitionError('NOT_FOUND', 'Order not found.', 404);
  // Only meaningful while the pickup leg is active.
  const active = ['rider_assigned', 'rider_on_the_way', 'rider_arrived'];
  if (!active.includes(order.status)) {
    throw new TransitionError('INVALID_STATE', `Rider can only be reassigned during the pickup leg (currently "${sm.labelFor(order.status)}").`, 409);
  }
  const rider = await prisma.user.findFirst({ where: { id: newRiderId, userType: 'rider', status: 'active' } });
  if (!rider) throw new TransitionError('BAD_RIDER', 'Selected rider is not available.', 400);

  const prevRiderId = order.assignedRiderId;
  await prisma.laundryRequest.update({ where: { id: orderId }, data: { assignedRiderId: newRiderId } });
  await prisma.requestStatusHistory.create({
    data: { requestId: orderId, status: order.status, notes: `Rider reassigned to ${rider.firstName} ${rider.lastName}.`, changedBy: actor.id },
  });
  await prisma.riderAssignment.upsert({
    where: { orderId }, update: { riderId: newRiderId, acceptedAt: new Date() },
    create: { orderId, riderId: newRiderId, acceptedAt: new Date() },
  }).catch(() => {});
  if (prevRiderId) {
    await prisma.user.update({ where: { id: prevRiderId }, data: { riderStatus: 'online' } }).catch(() => {});
  }

  const fresh = await prisma.laundryRequest.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  try { require('./realtime').emitOrderTransition(fresh, { from: order.status, to: order.status }); } catch (e) {}
  try {
    const { sendNotification } = require('./notification');
    await sendNotification(newRiderId, 'New Pickup Assigned', `You have been assigned to order #${fresh.requestNumber}.`, 'info', { orderId, screen: 'TaskDetails' });
    await sendNotification(fresh.userId, `Order #${fresh.requestNumber} Updated`, 'Your rider has been reassigned.', 'info', { orderId, screen: 'RequestDetails' });
  } catch (e) {}
  return shapeOrder(fresh, { role: actor.role });
}

module.exports = {
  TransitionError,
  transitionOrder,
  publishNewOrder,
  acceptPickup,
  acceptDelivery,
  declineDelivery,
  verifyWeight,
  markDelivered,
  cancelOrder,
  reassignRider,
  // re-export state machine helpers for convenience
  allowedActionsFor: sm.allowedActionsFor,
  canActorSet: sm.canActorSet,
};
