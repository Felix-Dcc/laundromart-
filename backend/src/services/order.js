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

// Calculate laundry cost from pricing table
async function calculateLaundryCost(serviceType, weight) {
  try {
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
