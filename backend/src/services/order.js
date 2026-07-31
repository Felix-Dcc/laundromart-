/**
 * Order helpers (numbering + cost). The order STATE MACHINE now lives in
 * orderStateMachine.js and all mutations go through orderService.js.
 */
const prisma = require('../lib/prisma');

// Generate unique request number
function generateRequestNumber() {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 9999) + 1;
  return `LMS${year}${String(random).padStart(4, '0')}`;
}

// Calculate laundry cost.
//
// Providers may define their own services with their own prices. When a
// providerId is supplied we look there FIRST, matching on the service name the
// order carries. Anything not found falls through to the platform-wide pricing
// table, so orders placed against the global service list price exactly as they
// always have — this is purely additive.
//
// per_item is intentionally not priced here: orders have no item-quantity field,
// so such a service would silently price at its unit rate. Those services are
// not offered for booking until a quantity exists.
async function calculateLaundryCost(serviceType, weight, providerId = null) {
  try {
    if (providerId) {
      const svc = await prisma.laundryService.findFirst({
        where: {
          providerId: Number(providerId),
          name: serviceType,
          deletedAt: null,
          status: 'available',
        },
      });
      if (svc) {
        if (svc.pricingType === 'per_kg' && svc.pricePerKg != null) {
          return parseFloat(svc.pricePerKg) * weight;
        }
        if (svc.pricingType === 'fixed' && svc.fixedPrice != null) {
          return parseFloat(svc.fixedPrice); // flat, independent of weight
        }
        // per_item (or a malformed row): fall through to global pricing rather
        // than inventing a number.
      }
    }

    const pricing = await prisma.laundryPricing.findFirst({
      where: { serviceType, status: 'active' },
    });
    if (pricing) {
      return parseFloat(pricing.pricePerKg) * weight;
    }
    return 0;
  } catch (error) {
    console.error('Cost calculation error:', error.message);
    return 0;
  }
}

module.exports = {
  generateRequestNumber,
  calculateLaundryCost,
};
