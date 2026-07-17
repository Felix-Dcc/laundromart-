/**
 * ============================================================
 * ORDER STATUS — single source of truth on the mobile side.
 * ============================================================
 * Mirrors backend/src/services/orderStateMachine.js. Screens read the order's
 * single `status` and use these helpers for labels, colors, timeline, and the
 * "next action" buttons. No screen should re-derive status meaning.
 */

// Ordered mainline lifecycle (index === progress step).
export const MAINLINE = [
  'created', 'awaiting_rider', 'rider_assigned', 'rider_on_the_way', 'rider_arrived',
  'picked_up', 'at_laundromat', 'weight_verified', 'preparing', 'washing', 'drying', 'ironing',
  'ready_for_delivery', 'delivery_rider_assigned', 'rider_to_laundromat',
  'collected_from_laundromat', 'out_for_delivery', 'rider_arrived_at_customer',
  'delivered', 'completed',
];

// label · icon (Ionicons) · color · bgColor · phase, per status.
export const STATUS_META = {
  created:                 { label: 'Order Created',               icon: 'receipt-outline',                color: '#f59e0b', bgColor: '#fef3c7', phase: 'setup' },
  awaiting_rider:          { label: 'Awaiting Rider',              icon: 'search-outline',                 color: '#f59e0b', bgColor: '#fef3c7', phase: 'setup' },
  rider_assigned:          { label: 'Rider Assigned',              icon: 'person-outline',                 color: '#3b82f6', bgColor: '#dbeafe', phase: 'pickup' },
  rider_on_the_way:        { label: 'Rider On The Way',            icon: 'navigate-outline',               color: '#3b82f6', bgColor: '#dbeafe', phase: 'pickup' },
  rider_arrived:           { label: 'Rider Arrived At Pickup',     icon: 'location-outline',               color: '#3b82f6', bgColor: '#dbeafe', phase: 'pickup' },
  picked_up:               { label: 'Laundry Picked Up',           icon: 'checkmark-circle-outline',       color: '#3b82f6', bgColor: '#dbeafe', phase: 'pickup' },
  at_laundromat:           { label: 'Delivered To Laundromat',     icon: 'business-outline',               color: '#8b5cf6', bgColor: '#ede9fe', phase: 'pickup' },
  weight_verified:         { label: 'Weight Verified',             icon: 'scale-outline',                  color: '#8b5cf6', bgColor: '#ede9fe', phase: 'service' },
  payment_confirmed:       { label: 'Payment Confirmed',           icon: 'card-outline',                   color: '#10b981', bgColor: '#d1fae5', phase: 'service' },
  preparing:               { label: 'Preparing To Wash',           icon: 'hourglass-outline',              color: '#8b5cf6', bgColor: '#ede9fe', phase: 'service' },
  washing:                 { label: 'Washing',                     icon: 'water-outline',                  color: '#8b5cf6', bgColor: '#ede9fe', phase: 'service' },
  drying:                  { label: 'Drying',                      icon: 'sunny-outline',                  color: '#8b5cf6', bgColor: '#ede9fe', phase: 'service' },
  ironing:                 { label: 'Ironing',                     icon: 'shirt-outline',                  color: '#8b5cf6', bgColor: '#ede9fe', phase: 'service' },
  ready_for_delivery:        { label: 'Ready For Pickup',              icon: 'checkmark-done-circle-outline', color: '#10b981', bgColor: '#d1fae5', phase: 'service' },
  delivery_rider_assigned:   { label: 'Rider Assigned For Delivery',   icon: 'person-outline',                color: '#0ea5e9', bgColor: '#e0f2fe', phase: 'delivery' },
  rider_to_laundromat:       { label: 'Rider On The Way To Laundromat',icon: 'navigate-outline',              color: '#0ea5e9', bgColor: '#e0f2fe', phase: 'delivery' },
  collected_from_laundromat: { label: 'Laundry Collected',            icon: 'cube-outline',                  color: '#0ea5e9', bgColor: '#e0f2fe', phase: 'delivery' },
  out_for_delivery:          { label: 'On The Way To You',            icon: 'bicycle-outline',               color: '#0ea5e9', bgColor: '#e0f2fe', phase: 'delivery' },
  rider_arrived_at_customer: { label: 'Rider Has Arrived',            icon: 'location-outline',              color: '#0ea5e9', bgColor: '#e0f2fe', phase: 'delivery' },
  delivered:                 { label: 'Delivered To Customer',        icon: 'home-outline',                  color: '#10b981', bgColor: '#d1fae5', phase: 'delivery' },
  completed:               { label: 'Order Completed',             icon: 'trophy-outline',                 color: '#059669', bgColor: '#a7f3d0', phase: 'done' },
  cancelled:               { label: 'Cancelled',                   icon: 'close-circle-outline',           color: '#ef4444', bgColor: '#fee2e2', phase: 'exception' },
  failed:                  { label: 'Failed',                      icon: 'alert-circle-outline',           color: '#ef4444', bgColor: '#fee2e2', phase: 'exception' },
  refunded:                { label: 'Refunded',                    icon: 'cash-outline',                   color: '#f59e0b', bgColor: '#fef3c7', phase: 'exception' },
};

// Allowed forward transitions (must match the backend).
const TRANSITIONS = {
  created:                 ['awaiting_rider', 'cancelled'],
  awaiting_rider:          ['rider_assigned', 'cancelled'],
  rider_assigned:          ['rider_on_the_way', 'cancelled'],
  rider_on_the_way:        ['rider_arrived', 'cancelled'],
  rider_arrived:           ['picked_up', 'cancelled'],
  picked_up:               ['at_laundromat', 'cancelled'],
  at_laundromat:           ['weight_verified', 'cancelled'],
  weight_verified:         ['preparing', 'cancelled'],
  preparing:               ['washing', 'cancelled'],
  washing:                 ['drying', 'ironing', 'ready_for_delivery', 'cancelled'],
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

const OWNER = {
  awaiting_rider: ['system'],
  rider_assigned: ['rider'], rider_on_the_way: ['rider'], rider_arrived: ['rider'],
  picked_up: ['rider'], at_laundromat: ['rider'],
  weight_verified: ['provider'],
  preparing: ['provider'], washing: ['provider'], drying: ['provider'], ironing: ['provider'], ready_for_delivery: ['provider'],
  delivery_rider_assigned: ['rider'], rider_to_laundromat: ['rider'], collected_from_laundromat: ['rider'],
  out_for_delivery: ['rider'], rider_arrived_at_customer: ['rider'], delivered: ['rider'],
  completed: ['system'],
  cancelled: ['user', 'admin', 'superadmin', 'system'],
  failed: ['admin', 'superadmin', 'system'],
  refunded: ['admin', 'superadmin'],
};

const TERMINAL = ['completed', 'cancelled', 'refunded'];

export function metaFor(status) {
  return STATUS_META[status] || { label: status, icon: 'ellipse-outline', color: '#6b7280', bgColor: '#f3f4f6', phase: 'unknown' };
}
export function labelFor(status) { return metaFor(status).label; }
export function colorFor(status) { return metaFor(status).color; }
export function isTerminal(status) { return TERMINAL.includes(status); }
export function stepIndexFor(status) { return MAINLINE.indexOf(status); }
export const TOTAL_STEPS = MAINLINE.length;

function canActorSet(role, to, from) {
  if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to)) return false;
  if (role === 'superadmin') return true;
  if (role === 'user') return to === 'cancelled' && ['created', 'awaiting_rider'].includes(from);
  if (role === 'admin') return ['cancelled', 'failed', 'refunded'].includes(to);
  return (OWNER[to] || []).includes(role);
}

/**
 * The next status actions a given role may perform from `status`, with labels.
 * Drives the action buttons on every dashboard. Note: the canonical list also
 * comes back from the API as order.allowedActions — use that when present.
 */
export function nextActionsFor(status, role) {
  return (TRANSITIONS[status] || [])
    .filter((to) => canActorSet(role, to, status))
    .map((to) => ({ to, label: labelFor(to) }));
}

// Progress steps for the customer timeline (mainline only).
export function progressSteps() {
  return MAINLINE.map((key) => ({ key, ...metaFor(key) }));
}
