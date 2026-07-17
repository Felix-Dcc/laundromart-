const express = require('express');
const { authenticate } = require('../middleware/auth');
const sm = require('../services/orderStateMachine');

const router = express.Router();
const prisma = require('../lib/prisma');

// ============================================================
// DEBUG: GET /api/debug/orders — snapshot of recent orders + status counts.
// Development-only (mounted behind !isProd in index.js).
// ============================================================
router.get('/orders', authenticate, async (req, res) => {
  try {
    const orders = await prisma.laundryRequest.findMany({
      select: {
        id: true, requestNumber: true, status: true,
        assignedRiderId: true, deliveryRiderId: true,
        pickupLatitude: true, pickupLongitude: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    let riderInfo = null;
    if (req.user.userType === 'rider') {
      riderInfo = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, riderStatus: true, latitude: true, longitude: true },
      });
    }

    // Count orders grouped by the single status field.
    const grouped = await prisma.laundryRequest.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = { total: 0 };
    grouped.forEach((g) => { counts[g.status] = g._count._all; counts.total += g._count._all; });

    res.json({ orders, riderInfo, counts });
  } catch (error) {
    console.error('Debug orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// DEBUG: GET /api/debug/rider-query — mirrors /rider/orders/available.
// ============================================================
router.get('/rider-query', authenticate, async (req, res) => {
  try {
    if (req.user.userType !== 'rider') return res.status(403).json({ error: 'Rider only endpoint' });

    const rider = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, riderStatus: true, latitude: true, longitude: true },
    });

    const whereClause = { status: 'awaiting_rider', assignedRiderId: null };
    const orders = await prisma.laundryRequest.findMany({
      where: whereClause,
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, address: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ rider, whereClause, ordersFound: orders.length, orders });
  } catch (error) {
    console.error('Debug rider query error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
