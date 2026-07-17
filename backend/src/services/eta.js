
const prisma = require('../lib/prisma');

// ============================================================
// ETA CALCULATION ENGINE
//
// Factors:
//   1. Service type base time (minutes)
//   2. Weight multiplier (heavier = longer)
//   3. Provider workload (active orders ahead in queue)
//   4. Current status (remaining steps)
//
// Recalculated on EVERY status change — never stale.
// ============================================================

// Base processing time per service type (minutes)
const SERVICE_BASE_MINUTES = {
  'Regular Wash':    60,
  'Dry Cleaning':    120,
  'Express Service': 30,
  'Delicate Items':  90,
  'Ironing Only':    20,
};
const DEFAULT_BASE_MINUTES = 60;

// Weight factor: extra minutes per kg above 3 kg
const WEIGHT_THRESHOLD_KG = 3;
const EXTRA_MINUTES_PER_KG = 5;

// Workload: minutes added per active order ahead in queue
const MINUTES_PER_QUEUED_ORDER = 15;

// Remaining-step multipliers (fraction of total work left) — keyed by the
// single OrderStatus. Monotonically decreasing along the lifecycle.
const REMAINING_FRACTION = {
  created:                 1.0,
  awaiting_rider:          1.0,
  rider_assigned:          0.95,
  rider_on_the_way:        0.9,
  rider_arrived:           0.88,
  picked_up:               0.85,
  at_laundromat:           0.8,
  weight_verified:         0.78,
  preparing:               0.7,
  washing:                 0.5,
  drying:                  0.35,
  ironing:                 0.25,
  ready_for_delivery:      0.15,
  delivery_rider_assigned: 0.1,
  out_for_delivery:        0.05,
  delivered:               0,
  completed:               0,
};

// ============================================================
// calculateETA(order) → { etaMinutes, estimatedCompletion }
// ============================================================
async function calculateETA(order) {
  const sm = require('./orderStateMachine');
  // Terminal states have no ETA
  if (sm.isTerminal(order.status)) {
    return { etaMinutes: 0, estimatedCompletion: null };
  }

  // 1. Base time from service type
  const baseMins = SERVICE_BASE_MINUTES[order.laundryType] || DEFAULT_BASE_MINUTES;

  // 2. Weight adjustment
  const weight = parseFloat(order.weightKg) || 0;
  const weightExtra = weight > WEIGHT_THRESHOLD_KG
    ? (weight - WEIGHT_THRESHOLD_KG) * EXTRA_MINUTES_PER_KG
    : 0;

  // 3. Provider workload — count orders in the wash phase ahead of this one
  const workload = await prisma.laundryRequest.count({
    where: {
      status: { in: ['preparing', 'washing', 'drying', 'ironing'] },
      id: { not: order.id },
      createdAt: { lt: order.createdAt },
      ...(order.providerId ? { providerId: order.providerId } : {}),
    },
  });
  const workloadExtra = workload * MINUTES_PER_QUEUED_ORDER;

  // 4. Remaining fraction based on current status
  const fraction = REMAINING_FRACTION[order.status] ?? 1.0;

  // Total ETA
  const totalProcessing = baseMins + weightExtra + workloadExtra;
  const etaMinutes = Math.round(totalProcessing * fraction);

  // Estimated completion timestamp
  const estimatedCompletion = new Date(Date.now() + etaMinutes * 60 * 1000);

  return { etaMinutes, estimatedCompletion };
}

// ============================================================
// updateOrderETA(orderId) — recalculate and persist
// Called after every status change
// ============================================================
async function updateOrderETA(orderId) {
  try {
    const order = await prisma.laundryRequest.findUnique({ where: { id: orderId } });
    if (!order) return null;

    const { etaMinutes, estimatedCompletion } = await calculateETA(order);

    await prisma.laundryRequest.update({
      where: { id: orderId },
      data: { etaMinutes, estimatedCompletion },
    });

    return { etaMinutes, estimatedCompletion };
  } catch (error) {
    console.error('ETA update error:', error.message);
    return null;
  }
}

module.exports = {
  calculateETA,
  updateOrderETA,
  SERVICE_BASE_MINUTES,
};
