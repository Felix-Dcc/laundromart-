const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logPricingUpdate } = require('../services/audit');
const { cacheWrap, cacheDel, KEYS } = require('../lib/cache');

const router = express.Router();
const prisma = require('../lib/prisma');

// Active pricing changes rarely but is read on nearly every order-form load
// and nearby query — cache it (invalidated on any pricing mutation below).
function loadActivePricing() {
  return prisma.laundryPricing.findMany({
    where: { status: 'active' },
    orderBy: { serviceType: 'asc' },
  });
}

// GET /api/pricing - List active services (public for order form)
router.get('/', authenticate, async (req, res) => {
  try {
    const pricing = await cacheWrap(KEYS.activePricing, 300, loadActivePricing);
    res.json({ pricing });
  } catch (error) {
    console.error('Pricing fetch error:', error);
    res.status(500).json({ error: 'Failed to load pricing.' });
  }
});

// GET /api/pricing/all - List all services (admin only, mirrors admin/pricing.php)
router.get('/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const pricing = await prisma.laundryPricing.findMany({
      orderBy: { serviceType: 'asc' },
    });
    res.json({ pricing });
  } catch (error) {
    console.error('Pricing fetch error:', error);
    res.status(500).json({ error: 'Failed to load pricing.' });
  }
});

// POST /api/pricing - Add new service (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { serviceType, pricePerKg, description, status } = req.body;

    // Validation
    const errors = [];
    if (!serviceType || !serviceType.trim()) errors.push('Service type is required.');
    const price = parseFloat(pricePerKg);
    if (!price || price <= 0) errors.push('Price must be greater than 0.');
    else if (price > 1000) errors.push('Price cannot exceed $1000 per kg.');

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const pricing = await prisma.laundryPricing.create({
      data: {
        serviceType: serviceType.trim(),
        pricePerKg: price,
        description: description ? description.trim() : null,
        status: status || 'active',
      },
    });

    await cacheDel(KEYS.activePricing);
    res.status(201).json({ message: 'New pricing added successfully!', pricing });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ errors: ['Service type already exists.'] });
    }
    console.error('Pricing create error:', error);
    res.status(500).json({ errors: ['Failed to add pricing.'] });
  }
});

// PUT /api/pricing/:id - Update service (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const pricingId = parseInt(req.params.id);
    const { serviceType, pricePerKg, description, status } = req.body;

    const errors = [];
    if (!serviceType || !serviceType.trim()) errors.push('Service type is required.');
    const price = parseFloat(pricePerKg);
    if (!price || price <= 0) errors.push('Price must be greater than 0.');
    else if (price > 1000) errors.push('Price cannot exceed $1000 per kg.');

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const pricing = await prisma.laundryPricing.update({
      where: { id: pricingId },
      data: {
        serviceType: serviceType.trim(),
        pricePerKg: price,
        description: description ? description.trim() : null,
        status: status || 'active',
      },
    });

    // Log audit event
    await logPricingUpdate(pricing, req.user.id, req);

    await cacheDel(KEYS.activePricing);
    res.json({ message: 'Pricing updated successfully!', pricing });
  } catch (error) {
    console.error('Pricing update error:', error);
    res.status(500).json({ errors: ['Failed to update pricing.'] });
  }
});

// DELETE /api/pricing/:id - Delete service (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const pricingId = parseInt(req.params.id);

    // Check if pricing is used in existing requests
    const pricing = await prisma.laundryPricing.findUnique({ where: { id: pricingId } });
    if (!pricing) {
      return res.status(404).json({ error: 'Pricing not found.' });
    }

    const usageCount = await prisma.laundryRequest.count({
      where: { laundryType: pricing.serviceType },
    });

    if (usageCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete pricing that is being used in existing requests. You can deactivate it instead.',
      });
    }

    await prisma.laundryPricing.delete({ where: { id: pricingId } });

    await cacheDel(KEYS.activePricing);
    res.json({ message: 'Pricing deleted successfully!' });
  } catch (error) {
    console.error('Pricing delete error:', error);
    res.status(500).json({ error: 'Failed to delete pricing.' });
  }
});

module.exports = router;
