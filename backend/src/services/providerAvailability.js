/**
 * Provider (laundromat) availability — the single backend authority on whether
 * a laundromat may receive a new order. Mirrors the mobile isOpenNow() parser so
 * the UI and API agree.
 *
 * A laundromat can be selected / receive an order only when it is:
 *   • a real provider account          (exists, userType = provider)
 *   • approved + active                (status = active)
 *   • accepting new orders             (acceptingOrders = true)
 *   • open per its business hours       (isOpenNow)
 */
const prisma = require('../lib/prisma');

// Parse "8:00 AM – 8:00 PM" → is the current local time within range?
// Returns true/false, or null when the hours string can't be parsed (in which
// case we do NOT block — treat as open to avoid false negatives).
function isOpenNow(businessHours, now = new Date()) {
  if (!businessHours) return null;
  const m = businessHours.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const toMin = (h, min, period) => {
    let hour = parseInt(h, 10);
    const p = period.toUpperCase();
    if (p === 'PM' && hour !== 12) hour += 12;
    if (p === 'AM' && hour === 12) hour = 0;
    return hour * 60 + parseInt(min, 10);
  };
  const open = toMin(m[1], m[2], m[3]);
  const close = toMin(m[4], m[5], m[6]);
  const cur = now.getHours() * 60 + now.getMinutes();
  // Handle overnight ranges (e.g. 6 PM – 2 AM) just in case.
  if (close <= open) return cur >= open || cur < close;
  return cur >= open && cur < close;
}

// Availability snapshot for a loaded provider record (no extra query).
// isOpen === null (unparseable hours) counts as open.
function availabilityOf(provider) {
  const active = provider.status === 'active';
  const accepting = provider.acceptingOrders !== false;
  const open = isOpenNow(provider.businessHours);
  const isOpen = open !== false; // null or true → treat as open
  return {
    active,
    acceptingOrders: accepting,
    isOpen,
    open, // raw tri-state (true/false/null) for UI badges
    available: active && accepting && isOpen,
  };
}

// Reason string when a provider can't take an order (or null when it can).
function unavailableReason(provider) {
  if (!provider || provider.userType !== 'provider') return 'This laundromat is not available.';
  if (provider.status !== 'active') return 'This laundromat is not currently active.';
  if (provider.acceptingOrders === false) return 'This laundromat is not accepting new orders right now.';
  if (isOpenNow(provider.businessHours) === false) return 'This laundromat is currently closed.';
  return null;
}

/**
 * Loads the provider and throws a { status, message } style error if it cannot
 * accept an order. Returns the provider record on success.
 */
async function assertProviderAvailable(providerId) {
  const provider = await prisma.user.findUnique({
    where: { id: Number(providerId) },
    select: {
      id: true, userType: true, status: true, acceptingOrders: true,
      businessHours: true, latitude: true, longitude: true, businessName: true,
    },
  });
  const err = (message) => Object.assign(new Error(message), { httpStatus: 400 });

  if (!provider || provider.userType !== 'provider') throw err('Selected laundromat could not be found.');
  const reason = unavailableReason(provider);
  if (reason) throw err(reason);
  return provider;
}

module.exports = { isOpenNow, availabilityOf, unavailableReason, assertProviderAvailable };
