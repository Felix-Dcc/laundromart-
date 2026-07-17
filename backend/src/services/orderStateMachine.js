/**
 * ============================================================
 * ORDER STATE MACHINE — the single source of truth
 * ============================================================
 * Pure data + pure functions (no I/O). Imported by:
 *   - services/orderService.js  (performs the transitions)
 *   - lib/orderShape.js         (serializes orders for clients)
 * The mobile app mirrors these keys/labels in utils/orderStatus.js.
 *
 * There is exactly ONE status field on an order. Every allowed move,
 * and who is allowed to make it, is defined here and nowhere else.
 */

// Ordered mainline lifecycle (index === progress step).
const MAINLINE = [
  'created',
  'awaiting_rider',
  'rider_assigned',
  'rider_on_the_way',
  'rider_arrived',
  'picked_up',
  'at_laundromat',
  'weight_verified',
  'preparing',
  'washing',
  'drying',
  'ironing',
  'ready_for_delivery',
  'delivery_rider_assigned',
  'rider_to_laundromat',
  'collected_from_laundromat',
  'out_for_delivery',
  'rider_arrived_at_customer',
  'delivered',
  'completed',
];

// Off-mainline exception states.
const EXCEPTION = ['cancelled', 'failed', 'refunded'];

// Per-status metadata. `owner` = the role(s) that normally drive the order
// INTO this state. `phase` groups steps for the UI. `message` is the
// customer-facing notification body.
const STATUS_META = {
  created:                 { label: 'Order Created',              phase: 'setup',     owner: ['system'],   message: 'Your order has been created.' },
  awaiting_rider:          { label: 'Awaiting Rider',             phase: 'setup',     owner: ['system'],   message: 'Looking for a rider to pick up your laundry.' },
  rider_assigned:          { label: 'Rider Assigned',             phase: 'pickup',    owner: ['rider'],    message: 'A rider has been assigned to your order.' },
  rider_on_the_way:        { label: 'Rider On The Way',           phase: 'pickup',    owner: ['rider'],    message: 'Your rider is on the way to pick up your laundry.' },
  rider_arrived:           { label: 'Rider Arrived At Pickup',    phase: 'pickup',    owner: ['rider'],    message: 'Your rider has arrived at the pickup location.' },
  picked_up:               { label: 'Laundry Picked Up',          phase: 'pickup',    owner: ['rider'],    message: 'Your laundry has been picked up.' },
  at_laundromat:           { label: 'Delivered To Laundromat',    phase: 'pickup',    owner: ['rider'],    message: 'Your laundry has arrived at the laundromat.' },
  weight_verified:         { label: 'Weight Verified',            phase: 'service',   owner: ['provider'], message: 'Your laundry has been weighed and verified. Please complete payment to begin washing.' },
  payment_confirmed:       { label: 'Payment Confirmed',          phase: 'service',   owner: ['system'],   message: 'Payment received. Your laundry is now being processed.' }, // timeline marker only (not a live order status)
  preparing:               { label: 'Preparing To Wash',          phase: 'service',   owner: ['provider'], message: 'The laundromat is preparing your laundry.' },
  washing:                 { label: 'Washing',                    phase: 'service',   owner: ['provider'], message: 'Your laundry is being washed.' },
  drying:                  { label: 'Drying',                     phase: 'service',   owner: ['provider'], message: 'Your laundry is being dried.' },
  ironing:                 { label: 'Ironing',                    phase: 'service',   owner: ['provider'], message: 'Your laundry is being ironed.' },
  ready_for_delivery:        { label: 'Ready For Pickup',              phase: 'service',  owner: ['provider'], message: 'Your laundry is clean and ready for delivery!' },
  delivery_rider_assigned:   { label: 'Rider Assigned For Delivery',   phase: 'delivery', owner: ['rider'],    message: 'A rider has been assigned to deliver your laundry.' },
  rider_to_laundromat:       { label: 'Rider On The Way To Laundromat',phase: 'delivery', owner: ['rider'],    message: 'Your rider is heading to the laundromat to collect your laundry.' },
  collected_from_laundromat: { label: 'Laundry Collected',            phase: 'delivery', owner: ['rider'],    message: 'Your rider has collected your clean laundry.' },
  out_for_delivery:          { label: 'On The Way To You',            phase: 'delivery', owner: ['rider'],    message: 'Your rider is on the way with your laundry.' },
  rider_arrived_at_customer: { label: 'Rider Has Arrived',            phase: 'delivery', owner: ['rider'],    message: 'Your rider has arrived with your laundry.' },
  delivered:                 { label: 'Delivered To Customer',        phase: 'delivery', owner: ['rider'],    message: 'Your laundry has been delivered. Enjoy!' },
  completed:               { label: 'Order Completed',            phase: 'done',      owner: ['system'],   message: 'Your order is complete. Thank you!' },
  cancelled:               { label: 'Cancelled',                  phase: 'exception', owner: ['user', 'admin', 'superadmin', 'system'], message: 'Your order has been cancelled.' },
  failed:                  { label: 'Failed',                     phase: 'exception', owner: ['admin', 'superadmin', 'system'],         message: 'Your order could not be completed.' },
  refunded:                { label: 'Refunded',                   phase: 'exception', owner: ['admin', 'superadmin'],                   message: 'Your order has been refunded.' },
};

// Allowed next states from each state. This is the ONLY forward map.
const TRANSITIONS = {
  created:                 ['awaiting_rider', 'cancelled'],
  awaiting_rider:          ['rider_assigned', 'cancelled'],
  rider_assigned:          ['rider_on_the_way', 'cancelled'],
  rider_on_the_way:        ['rider_arrived', 'cancelled'],
  rider_arrived:           ['picked_up', 'cancelled'],
  picked_up:               ['at_laundromat', 'cancelled'],
  at_laundromat:           ['weight_verified', 'cancelled'],
  weight_verified:         ['preparing', 'cancelled'], // → preparing is payment-gated (see orderService)
  preparing:               ['washing', 'cancelled'],
  washing:                 ['drying', 'ironing', 'ready_for_delivery', 'cancelled'], // drying/ironing optional
  drying:                  ['ironing', 'ready_for_delivery', 'cancelled'],
  ironing:                 ['ready_for_delivery', 'cancelled'],
  ready_for_delivery:        ['delivery_rider_assigned', 'cancelled'],
  delivery_rider_assigned:   ['rider_to_laundromat', 'cancelled'],
  rider_to_laundromat:       ['collected_from_laundromat', 'cancelled'],
  collected_from_laundromat: ['out_for_delivery', 'cancelled'],
  out_for_delivery:          ['rider_arrived_at_customer', 'failed'],
  rider_arrived_at_customer: ['delivered', 'failed'],
  delivered:                 ['completed'],
  completed:               [],
  cancelled:               [],
  failed:                  ['refunded'],
  refunded:                [],
};

const TERMINAL = ['completed', 'cancelled', 'refunded'];

// ── Pure helpers ──────────────────────────────────────────

function isValidStatus(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_META, status);
}

function isTerminal(status) {
  return TERMINAL.includes(status);
}

function canTransition(from, to) {
  return !!TRANSITIONS[from] && TRANSITIONS[from].includes(to);
}

function stepIndex(status) {
  return MAINLINE.indexOf(status); // -1 for exception states
}

function labelFor(status) {
  return STATUS_META[status] ? STATUS_META[status].label : status;
}

/**
 * May an actor of `role` move an order from `from` → `to`?
 * Encodes every role rule from the spec in one place.
 */
function canActorSet(role, to, from) {
  if (!canTransition(from, to)) return false;

  // Super admin: full platform control.
  if (role === 'superadmin') return true;

  // Internal/system transitions (auto-advance).
  if (role === 'system') return (STATUS_META[to].owner || []).includes('system');

  // Customer: may only cancel, and only before a rider is involved.
  if (role === 'user') {
    return to === 'cancelled' && ['created', 'awaiting_rider'].includes(from);
  }

  // Admin: dispute/monitoring powers only — cancel, fail, refund.
  // Cannot perform normal rider/provider operational steps.
  if (role === 'admin') {
    return ['cancelled', 'failed', 'refunded'].includes(to);
  }

  // Rider / Provider: only the steps they own.
  return (STATUS_META[to].owner || []).includes(role);
}

/**
 * Every next status `role` is allowed to set from `from`, with labels.
 * Drives the "Next Allowed Action" buttons in every dashboard.
 */
function allowedActionsFor(from, role) {
  return (TRANSITIONS[from] || [])
    .filter((to) => canActorSet(role, to, from))
    .map((to) => ({ to, label: labelFor(to) }));
}

module.exports = {
  MAINLINE,
  EXCEPTION,
  STATUS_META,
  TRANSITIONS,
  TERMINAL,
  isValidStatus,
  isTerminal,
  canTransition,
  canActorSet,
  allowedActionsFor,
  stepIndex,
  labelFor,
};
