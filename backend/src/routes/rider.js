const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { calculateDistance } = require('../services/rider');
const {
  getMaxActiveTasks, getActiveTaskCount, getRiderTasks,
  optimizePickupOrder, computeRoute, getDispatchSettings, providerName,
} = require('../services/dispatch');
const {
  acceptPickup, acceptDelivery, declineDelivery, markDelivered, transitionOrder, TransitionError,
} = require('../services/orderService');
const { ORDER_INCLUDE, shapeOrder } = require('../lib/orderShape');

const router = express.Router();
const prisma = require('../lib/prisma');
const requireRider = requireRole('rider');

// Flat delivery earnings shown on the request card (matches orderService credit).
const DELIVERY_EARNINGS = 10.0;

// Pickup-leg statuses that count as an active task the rider is carrying.
const PICKUP_ACTIVE = ['rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up'];
// Delivery-leg statuses the rider is actively handling.
const DELIVERY_ACTIVE = [
  'delivery_rider_assigned', 'rider_to_laundromat', 'collected_from_laundromat',
  'out_for_delivery', 'rider_arrived_at_customer',
];

function sendTransitionError(res, error, fallback) {
  if (error instanceof TransitionError) return res.status(error.status).json({ error: error.message, code: error.code });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

const round2 = (n) => Math.round(n * 100) / 100;

// Shared helper for a rider status step (on-the-way / arrived / picked-up / etc.)
async function riderStep(req, res, to, extraData = {}) {
  try {
    const orderId = parseInt(req.params.id);
    const order = await prisma.laundryRequest.findUnique({
      where: { id: orderId },
      select: { assignedRiderId: true, deliveryRiderId: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Only the rider actually on this leg may drive it.
    const mine = order.assignedRiderId === req.user.id || order.deliveryRiderId === req.user.id;
    if (!mine) return res.status(403).json({ error: 'This order is not assigned to you.' });

    const shaped = await transitionOrder({
      orderId, to,
      actor: { id: req.user.id, role: 'rider', name: `${req.user.firstName} ${req.user.lastName}` },
      extraData, req,
    });
    res.json({ message: 'Order updated.', order: shaped });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to update order.');
  }
}

// ============================================================
// GET /api/rider/status — rider profile + active task summary
// ============================================================
router.get('/status', authenticate, requireRider, async (req, res) => {
  try {
    const rider = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        riderStatus: true, latitude: true, longitude: true,
        totalPickups: true, totalEarnings: true, lastLocationUpdate: true,
      },
    });

    const activeOrder = await prisma.laundryRequest.findFirst({
      where: { assignedRiderId: req.user.id, status: { in: PICKUP_ACTIVE } },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const [activeTaskCount, maxActiveTasks] = await Promise.all([
      getActiveTaskCount(req.user.id),
      getMaxActiveTasks(),
    ]);

    res.json({
      rider,
      activeOrder: activeOrder ? shapeOrder(activeOrder, { role: 'rider' }) : null,
      activeTaskCount,
      maxActiveTasks,
      canAcceptMore: activeTaskCount < maxActiveTasks,
    });
  } catch (error) {
    console.error('Rider status error:', error);
    res.status(500).json({ error: 'Failed to fetch rider status.' });
  }
});

// ============================================================
// PUT /api/rider/go-online | go-offline | update-location
// ============================================================
router.put('/go-online', authenticate, requireRider, async (req, res) => {
  try {
    // Self-heal: detach from any cancelled order still pointing at this rider.
    await prisma.laundryRequest.updateMany({
      where: { assignedRiderId: req.user.id, status: 'cancelled' }, data: { assignedRiderId: null },
    });
    await prisma.user.update({ where: { id: req.user.id }, data: { riderStatus: 'online' } });
    res.json({ message: 'You are now online and available for pickups.' });
  } catch (error) {
    console.error('Go online error:', error);
    res.status(500).json({ error: 'Failed to go online.' });
  }
});

router.put('/go-offline', authenticate, requireRider, async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { riderStatus: 'offline' } });
    res.json({ message: 'You are now offline.' });
  } catch (error) {
    console.error('Go offline error:', error);
    res.status(500).json({ error: 'Failed to go offline.' });
  }
});

router.put('/update-location', authenticate, requireRider, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) return res.status(400).json({ error: 'Latitude and longitude are required.' });
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return res.status(400).json({ error: 'Invalid coordinates.' });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { latitude: parseFloat(latitude), longitude: parseFloat(longitude), lastLocationUpdate: new Date() },
    });
    res.json({ message: 'Location updated successfully.' });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location.' });
  }
});

// ============================================================
// GET /api/rider/orders/available — pickups awaiting a rider
// ============================================================
router.get('/orders/available', authenticate, requireRider, async (req, res) => {
  try {
    const rider = await prisma.user.findUnique({
      where: { id: req.user.id }, select: { riderStatus: true, latitude: true, longitude: true },
    });
    if (rider.riderStatus !== 'online') return res.status(400).json({ error: 'You must be online to see available orders.' });

    const [activeTaskCount, settings] = await Promise.all([getActiveTaskCount(req.user.id), getDispatchSettings()]);
    const maxActiveTasks = settings.maxActiveTasks;
    if (activeTaskCount >= maxActiveTasks) {
      return res.json({ orders: [], limitReached: true, activeTaskCount, maxActiveTasks });
    }

    const orders = await prisma.laundryRequest.findMany({
      where: { status: 'awaiting_rider', assignedRiderId: null },
      include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take: 50,
    });

    const radius = settings.maxPickupRadiusKm;
    const enriched = orders.map((order) => {
      let distanceKm = null;
      if (rider.latitude && rider.longitude && order.pickupLatitude && order.pickupLongitude) {
        distanceKm = calculateDistance(rider.latitude, rider.longitude, order.pickupLatitude, order.pickupLongitude);
      }
      return { ...shapeOrder(order, { role: 'rider' }), distanceKm };
    });

    const withinRadius = radius ? enriched.filter((o) => o.distanceKm == null || o.distanceKm <= radius) : enriched;
    withinRadius.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

    res.json({ orders: withinRadius, limitReached: false, activeTaskCount, maxActiveTasks, maxPickupRadiusKm: radius });
  } catch (error) {
    console.error('Get available orders error:', error);
    res.status(500).json({ error: 'Failed to fetch available orders.', details: error.message });
  }
});

// ============================================================
// GET /api/rider/orders/available-deliveries — clean laundry ready to return
// ============================================================
router.get('/orders/available-deliveries', authenticate, requireRider, async (req, res) => {
  try {
    const rider = await prisma.user.findUnique({
      where: { id: req.user.id }, select: { riderStatus: true, latitude: true, longitude: true },
    });
    if (rider.riderStatus !== 'online') return res.status(400).json({ error: 'You must be online to see available deliveries.' });

    // Orders this rider previously declined stay hidden from them (still shown
    // to everyone else — auto-requeue).
    const declined = await prisma.deliveryDecline.findMany({
      where: { riderId: req.user.id }, select: { orderId: true },
    });
    const declinedIds = declined.map((d) => d.orderId);

    const orders = await prisma.laundryRequest.findMany({
      where: {
        status: 'ready_for_delivery',
        deliveryRiderId: null,
        ...(declinedIds.length ? { id: { notIn: declinedIds } } : {}),
      },
      include: ORDER_INCLUDE, orderBy: { updatedAt: 'asc' }, take: 50,
    });

    const enriched = orders.map((order) => {
      // Distance from the rider to the laundromat (the collection point)…
      let distanceKm = null;
      if (rider.latitude && rider.longitude && order.laundromatLatitude && order.laundromatLongitude) {
        distanceKm = round2(calculateDistance(rider.latitude, rider.longitude, order.laundromatLatitude, order.laundromatLongitude));
      }
      // …and the actual delivery distance (laundromat → customer).
      let deliveryDistanceKm = null;
      if (order.laundromatLatitude && order.laundromatLongitude && order.pickupLatitude && order.pickupLongitude) {
        deliveryDistanceKm = round2(calculateDistance(order.laundromatLatitude, order.laundromatLongitude, order.pickupLatitude, order.pickupLongitude));
      }
      return {
        ...shapeOrder(order, { role: 'rider' }),
        distanceKm,
        deliveryDistanceKm,
        estimatedEarnings: DELIVERY_EARNINGS,
      };
    });
    enriched.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

    res.json({ orders: enriched });
  } catch (error) {
    console.error('Get available deliveries error:', error);
    res.status(500).json({ error: 'Failed to fetch available deliveries.' });
  }
});

// ============================================================
// GET /api/rider/tasks — active pickup tasks + optimized route
// ============================================================
router.get('/tasks', authenticate, requireRider, async (req, res) => {
  try {
    const [rider, tasks, maxActiveTasks] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id }, select: { latitude: true, longitude: true } }),
      getRiderTasks(req.user.id),
      getMaxActiveTasks(),
    ]);

    const riderLoc = rider && rider.latitude != null ? { latitude: rider.latitude, longitude: rider.longitude } : null;

    const shaped = tasks.map((t) => {
      const distanceKm = riderLoc && t.pickupLatitude != null && t.pickupLongitude != null
        ? Math.round(calculateDistance(riderLoc.latitude, riderLoc.longitude, t.pickupLatitude, t.pickupLongitude) * 100) / 100
        : null;
      return {
        id: t.id,
        requestNumber: t.requestNumber,
        status: t.status,
        laundryType: t.laundryType,
        weightKg: t.weightKg,
        notes: t.specialInstructions || null,
        pickupTime: t.pickupTime,
        pickupDate: t.pickupDate,
        pickupAddress: t.pickupAddress,
        pickupLatitude: t.pickupLatitude,
        pickupLongitude: t.pickupLongitude,
        laundromatLatitude: t.laundromatLatitude,
        laundromatLongitude: t.laundromatLongitude,
        distanceKm,
        etaMin: distanceKm != null ? Math.max(5, Math.round(distanceKm * 3)) : null,
        customer: t.user ? { name: `${t.user.firstName} ${t.user.lastName}`, phone: t.user.phone, address: t.user.address } : null,
        provider: t.provider ? {
          id: t.provider.id, name: providerName(t.provider), address: t.provider.address,
          phone: t.provider.phone, latitude: t.provider.latitude, longitude: t.provider.longitude,
        } : null,
      };
    });

    const optimizedOrder = optimizePickupOrder(riderLoc, tasks);
    const summary = computeRoute(riderLoc, tasks, optimizedOrder);

    res.json({
      tasks: shaped,
      optimizedOrder,
      route: summary.route,
      totalDistanceKm: summary.totalDistanceKm,
      estDurationMin: summary.estDurationMin,
      recommendedNextId: summary.recommendedNextId,
      riderLocation: riderLoc,
      activeTaskCount: tasks.length,
      maxActiveTasks,
      canAcceptMore: tasks.length < maxActiveTasks,
    });
  } catch (error) {
    console.error('Get rider tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks.' });
  }
});

// ============================================================
// GET /api/rider/orders/active — current active order (pickup or delivery leg)
// ============================================================
router.get('/orders/active', authenticate, requireRider, async (req, res) => {
  try {
    const activeOrder = await prisma.laundryRequest.findFirst({
      where: {
        OR: [
          { assignedRiderId: req.user.id, status: { in: PICKUP_ACTIVE } },
          { deliveryRiderId: req.user.id, status: { in: DELIVERY_ACTIVE } },
        ],
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    if (!activeOrder) return res.json({ order: null });

    const rider = await prisma.user.findUnique({ where: { id: req.user.id }, select: { latitude: true, longitude: true } });
    let pickupDistanceKm = null; let laundromatDistanceKm = null;
    if (rider && rider.latitude && rider.longitude) {
      if (activeOrder.pickupLatitude && activeOrder.pickupLongitude) {
        pickupDistanceKm = calculateDistance(rider.latitude, rider.longitude, activeOrder.pickupLatitude, activeOrder.pickupLongitude);
      }
      if (activeOrder.laundromatLatitude && activeOrder.laundromatLongitude) {
        laundromatDistanceKm = calculateDistance(rider.latitude, rider.longitude, activeOrder.laundromatLatitude, activeOrder.laundromatLongitude);
      }
    }

    res.json({
      order: shapeOrder(activeOrder, { role: 'rider' }),
      pickupDistanceKm,
      laundromatDistanceKm,
      riderLocation: rider ? { latitude: rider.latitude, longitude: rider.longitude } : null,
    });
  } catch (error) {
    console.error('Get active order error:', error);
    res.status(500).json({ error: 'Failed to fetch active order.' });
  }
});

// ============================================================
// GET /api/rider/orders/my-orders — everything the rider has touched
// ============================================================
router.get('/orders/my-orders', authenticate, requireRider, async (req, res) => {
  try {
    const orders = await prisma.laundryRequest.findMany({
      where: { OR: [{ assignedRiderId: req.user.id }, { deliveryRiderId: req.user.id }] },
      include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take: 50,
    });
    res.json({ orders: orders.map((o) => shapeOrder(o, { role: 'rider' })) });
  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// ============================================================
// POST /api/rider/orders/:id/accept — accept a PICKUP (atomic, first-come)
// ============================================================
router.post('/orders/:id/accept', authenticate, requireRider, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const rider = await prisma.user.findUnique({ where: { id: req.user.id }, select: { riderStatus: true, firstName: true, lastName: true } });
    if (rider.riderStatus !== 'online') return res.status(400).json({ error: 'You must be online to accept orders.' });

    const [activeTaskCount, maxActiveTasks] = await Promise.all([getActiveTaskCount(req.user.id), getMaxActiveTasks()]);
    if (activeTaskCount >= maxActiveTasks) {
      return res.status(400).json({ error: `Maximum active tasks reached (${maxActiveTasks}). Deliver a pickup to its laundromat before accepting more.` });
    }

    const shaped = await acceptPickup({ orderId, rider: { id: req.user.id, firstName: rider.firstName, lastName: rider.lastName }, req });
    res.json({ message: 'Order accepted successfully.', order: shaped });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to accept order.');
  }
});

// POST /api/rider/orders/:id/accept-delivery — accept a return DELIVERY
router.post('/orders/:id/accept-delivery', authenticate, requireRider, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const rider = await prisma.user.findUnique({ where: { id: req.user.id }, select: { riderStatus: true, firstName: true, lastName: true } });
    if (rider.riderStatus !== 'online') return res.status(400).json({ error: 'You must be online to accept deliveries.' });

    const shaped = await acceptDelivery({ orderId, rider: { id: req.user.id, firstName: rider.firstName, lastName: rider.lastName }, req });
    res.json({ message: 'Delivery accepted successfully.', order: shaped });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to accept delivery.');
  }
});

// POST /api/rider/orders/:id/decline-delivery — decline; requeues to others
router.post('/orders/:id/decline-delivery', authenticate, requireRider, async (req, res) => {
  try {
    await declineDelivery({ orderId: parseInt(req.params.id), riderId: req.user.id });
    res.json({ message: 'Delivery declined. It remains available to other riders.' });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to decline delivery.');
  }
});

// ============================================================
// Rider status steps — each validated by the OrderService state machine.
// Pickup leg: on-the-way → arrived → picked-up → at-laundromat
// Delivery leg: out-for-delivery → delivered (auto-completes)
// ============================================================
router.put('/orders/:id/on-the-way', authenticate, requireRider, (req, res) => riderStep(req, res, 'rider_on_the_way'));
router.put('/orders/:id/arrived', authenticate, requireRider, (req, res) => riderStep(req, res, 'rider_arrived'));
router.put('/orders/:id/picked-up', authenticate, requireRider, (req, res) => riderStep(req, res, 'picked_up'));

router.put('/orders/:id/at-laundromat', authenticate, requireRider, (req, res) => {
  const { laundromatLatitude, laundromatLongitude } = req.body;
  const extra = {};
  if (laundromatLatitude != null) extra.laundromatLatitude = parseFloat(laundromatLatitude);
  if (laundromatLongitude != null) extra.laundromatLongitude = parseFloat(laundromatLongitude);
  return riderStep(req, res, 'at_laundromat', extra);
});

// ── Delivery leg (return trip) ──
// delivery_rider_assigned → rider_to_laundromat → collected_from_laundromat
//   → out_for_delivery → rider_arrived_at_customer → delivered (auto-completes)
router.put('/orders/:id/to-laundromat', authenticate, requireRider, (req, res) => riderStep(req, res, 'rider_to_laundromat'));
router.put('/orders/:id/collected', authenticate, requireRider, (req, res) => riderStep(req, res, 'collected_from_laundromat'));
router.put('/orders/:id/out-for-delivery', authenticate, requireRider, (req, res) => riderStep(req, res, 'out_for_delivery'));
router.put('/orders/:id/arrived-customer', authenticate, requireRider, (req, res) => riderStep(req, res, 'rider_arrived_at_customer'));

// Final delivery to the customer → also auto-completes the order.
router.put('/orders/:id/delivered', authenticate, requireRider, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = await prisma.laundryRequest.findUnique({ where: { id: orderId }, select: { deliveryRiderId: true, assignedRiderId: true } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.deliveryRiderId !== req.user.id && order.assignedRiderId !== req.user.id) {
      return res.status(403).json({ error: 'This delivery is not assigned to you.' });
    }
    const shaped = await markDelivered({ orderId, rider: { id: req.user.id, firstName: req.user.firstName, lastName: req.user.lastName }, req });
    res.json({ message: 'Delivered to customer. Order completed.', order: shaped });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to mark delivered.');
  }
});

// ============================================================
// GET /api/rider/earnings — completed legs + lifetime stats
// ============================================================
router.get('/earnings', authenticate, requireRider, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    // A pickup is "earned" once it has reached the laundromat (pickedUpAt set).
    const where = { riderId: req.user.id, pickedUpAt: { not: null } };
    if (startDate || endDate) {
      where.pickedUpAt = { not: null };
      if (startDate) where.pickedUpAt.gte = new Date(startDate);
      if (endDate) where.pickedUpAt.lte = new Date(endDate);
    }

    const [completedPickups, totals, rider] = await Promise.all([
      prisma.riderAssignment.findMany({
        where,
        include: { order: { include: { user: { select: { firstName: true, lastName: true } } } } },
        orderBy: { pickedUpAt: 'desc' },
      }),
      prisma.riderAssignment.aggregate({ where, _sum: { riderEarnings: true }, _count: { id: true } }),
      prisma.user.findUnique({ where: { id: req.user.id }, select: { totalPickups: true, totalEarnings: true } }),
    ]);

    res.json({
      completedPickups,
      totalEarnings: totals._sum.riderEarnings || 0,
      totalCount: totals._count.id || 0,
      lifetimeStats: { totalPickups: rider.totalPickups, totalEarnings: rider.totalEarnings },
    });
  } catch (error) {
    console.error('Earnings error:', error);
    res.status(500).json({ error: 'Failed to fetch earnings.' });
  }
});

module.exports = router;
