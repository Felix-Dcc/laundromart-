const express = require('express');
const config = require('../config');
const { authenticate, requireUser } = require('../middleware/auth');
const { generateRequestNumber, calculateLaundryCost } = require('../services/order');
const { publishNewOrder, cancelOrder, TransitionError } = require('../services/orderService');
const { logOrderCreated } = require('../services/audit');
const { assertProviderAvailable } = require('../services/providerAvailability');
const promo = require('../services/promo');
const { ORDER_INCLUDE, shapeOrder } = require('../lib/orderShape');

const router = express.Router();
const prisma = require('../lib/prisma');

router.use(authenticate);

// Translate an OrderService TransitionError into an HTTP response.
function sendTransitionError(res, error, fallback = 'Failed to update order.') {
  if (error instanceof TransitionError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

// GET /api/orders - List the current user's orders (canonical shape)
router.get('/', requireUser, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = config.app.recordsPerPage;
    const offset = (page - 1) * limit;
    const { status, search } = req.query;

    const where = { userId: req.user.id };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { requestNumber: { contains: search, mode: 'insensitive' } },
        { laundryType: { contains: search, mode: 'insensitive' } },
        { pickupAddress: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [requests, totalRecords] = await Promise.all([
      prisma.laundryRequest.findMany({
        where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
      }),
      prisma.laundryRequest.count({ where }),
    ]);

    res.json({
      requests: requests.map((r) => shapeOrder(r, { role: req.user.userType })),
      pagination: { page, limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) },
    });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

// GET /api/orders/:id - Canonical order details
router.get('/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const where = { id: requestId };
    if (req.user.userType === 'user') where.userId = req.user.id;

    const request = await prisma.laundryRequest.findFirst({ where, include: ORDER_INCLUDE });
    if (!request) return res.status(404).json({ error: 'Request not found.' });

    const shaped = shapeOrder(request, { role: req.user.userType });
    res.json({ request: shaped, eta: shaped.eta });
  } catch (error) {
    console.error('Order details error:', error);
    res.status(500).json({ error: 'Failed to load order details.' });
  }
});

// GET /api/orders/:id/rider-location - Last known location of the active rider
router.get('/:id/rider-location', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const where = { id: requestId };
    if (req.user.userType === 'user') where.userId = req.user.id;

    const order = await prisma.laundryRequest.findFirst({
      where,
      select: {
        id: true, status: true, assignedRiderId: true, deliveryRiderId: true,
        assignedRider: { select: { latitude: true, longitude: true, lastLocationUpdate: true } },
        deliveryRider: { select: { latitude: true, longitude: true, lastLocationUpdate: true } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // During the return leg, track the delivery rider; otherwise the pickup rider.
    const deliveryPhase = ['delivery_rider_assigned', 'out_for_delivery', 'delivered'].includes(order.status);
    const r = deliveryPhase ? order.deliveryRider : order.assignedRider;
    const riderLocation = r && r.latitude != null && r.longitude != null
      ? { latitude: r.latitude, longitude: r.longitude, updatedAt: r.lastLocationUpdate }
      : null;

    res.json({ riderLocation, status: order.status });
  } catch (error) {
    console.error('Rider location fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch rider location.' });
  }
});

// GET /api/orders/:id/eta - Live ETA
router.get('/:id/eta', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const where = { id: requestId };
    if (req.user.userType === 'user') where.userId = req.user.id;

    const order = await prisma.laundryRequest.findFirst({ where, include: ORDER_INCLUDE });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const shaped = shapeOrder(order, { role: req.user.userType });
    res.json({ eta: shaped.eta, status: shaped.status });
  } catch (error) {
    console.error('ETA fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch ETA.' });
  }
});

// POST /api/orders/promo-quote - Preview a promo code against an estimate
// Body: { code, laundryType, weightKg }
router.post('/promo-quote', requireUser, async (req, res) => {
  try {
    const { code, laundryType, weightKg, providerId } = req.body;
    const weight = parseFloat(weightKg);
    if (!code || !laundryType || !weight || weight <= 0) {
      return res.status(400).json({ error: 'Code, service and weight are required.' });
    }
    // Quote against the same price the order will actually use.
    const subtotal = await calculateLaundryCost(laundryType, weight, providerId);
    const result = await promo.quote(code, subtotal);
    res.json({ subtotal, ...result });
  } catch (error) {
    console.error('Promo quote error:', error);
    res.status(500).json({ error: 'Failed to check promo code.' });
  }
});

// POST /api/orders - Create a new laundry request
router.post('/', requireUser, async (req, res) => {
  try {
    const {
      pickupDate, pickupTime, deliveryDate, deliveryTime,
      pickupAddress, deliveryAddress, laundryType,
      weightKg, specialInstructions, paymentMethod, promoCode,
      pickupLatitude, pickupLongitude,
      providerId, laundromatLatitude, laundromatLongitude,
    } = req.body;

    const errors = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const finalPickupDate = pickupDate || today.toISOString().split('T')[0];
    const pickupDateObj = new Date(finalPickupDate);
    pickupDateObj.setHours(0, 0, 0, 0);
    if (pickupDateObj < today) errors.push('Pickup date cannot be in the past.');
    if (!pickupTime) errors.push('Pickup time is required.');
    if (!pickupAddress || !pickupAddress.trim()) errors.push('Pickup address is required.');
    if (!deliveryAddress || !deliveryAddress.trim()) errors.push('Delivery address is required.');
    if (!laundryType || !laundryType.trim()) errors.push('Laundry service type is required.');
    // Every order MUST belong to a specific laundromat — no random orders.
    if (!providerId) errors.push('Please choose a laundromat for your order.');

    const weight = parseFloat(weightKg);
    if (!weight || weight <= 0) errors.push('Weight must be greater than 0.');
    else if (weight > 50) errors.push('Maximum weight is 50 kg per request.');

    if (errors.length > 0) return res.status(400).json({ errors });

    // Validate the laundromat is real, active/approved, open, and accepting.
    let provider;
    try {
      provider = await assertProviderAvailable(providerId);
    } catch (e) {
      return res.status(e.httpStatus || 400).json({ errors: [e.message] });
    }

    // providerId => the chosen laundromat's own price wins, else global pricing.
    const totalAmount = await calculateLaundryCost(laundryType, weight, providerId);
    const requestNumber = generateRequestNumber();

    // Optional promo code — validated against the estimate subtotal.
    let promoApplied = null;
    let promoDiscount = 0;
    if (promoCode) {
      const q = await promo.quote(promoCode, totalAmount);
      if (!q.ok) return res.status(400).json({ errors: [q.reason || 'Invalid promo code.'] });
      promoApplied = q.code;
      promoDiscount = q.discount;
    }

    let finalPickupLat = pickupLatitude ? parseFloat(pickupLatitude) : null;
    let finalPickupLon = pickupLongitude ? parseFloat(pickupLongitude) : null;
    if (!finalPickupLat || !finalPickupLon) {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { latitude: true, longitude: true } });
      if (u && u.latitude && u.longitude) { finalPickupLat = u.latitude; finalPickupLon = u.longitude; }
    }

    // Order stays linked to the validated laundromat for its whole lifecycle.
    const finalProviderId = provider.id;
    let finalLaundromatLat = laundromatLatitude != null ? parseFloat(laundromatLatitude) : provider.latitude;
    let finalLaundromatLon = laundromatLongitude != null ? parseFloat(laundromatLongitude) : provider.longitude;

    // Create in the initial "created" state, with the opening history row.
    const request = await prisma.laundryRequest.create({
      data: {
        userId: req.user.id,
        requestNumber,
        pickupDate: new Date(finalPickupDate),
        pickupTime,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        deliveryTime: deliveryTime || null,
        pickupAddress: pickupAddress.trim(),
        deliveryAddress: deliveryAddress.trim(),
        laundryType: laundryType.trim(),
        weightKg: weight,
        specialInstructions: specialInstructions ? specialInstructions.trim() : null,
        paymentMethod: paymentMethod || null,
        promoCode: promoApplied,
        promoDiscount,
        totalAmount,
        pickupLatitude: finalPickupLat,
        pickupLongitude: finalPickupLon,
        providerId: finalProviderId,
        laundromatLatitude: finalLaundromatLat,
        laundromatLongitude: finalLaundromatLon,
        status: 'created',
        statusHistory: {
          create: { status: 'created', notes: 'Order created by customer.', changedBy: req.user.id },
        },
      },
    });

    await logOrderCreated(request, req.user.id, req);

    // System auto-advance created → awaiting_rider (publishes to riders,
    // notifies provider + admins, emits realtime, sets ETA).
    const shaped = await publishNewOrder(request.id, req.user.id, req);

    res.status(201).json({
      message: `Your laundry request has been submitted successfully! Request number: ${requestNumber}`,
      request: shaped,
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ errors: ['Failed to submit request. Please try again.'] });
  }
});

// PUT /api/orders/:id/cancel - Customer cancels (only before a rider accepts)
router.put('/:id/cancel', requireUser, async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const owned = await prisma.laundryRequest.findFirst({ where: { id: requestId, userId: req.user.id }, select: { id: true } });
    if (!owned) return res.status(404).json({ error: 'Request not found.' });

    const shaped = await cancelOrder({
      orderId: requestId,
      actor: { id: req.user.id, role: 'user', name: `${req.user.firstName} ${req.user.lastName}` },
      notes: 'Cancelled by customer.',
      req,
    });
    res.json({ message: 'Request cancelled successfully.', request: shaped });
  } catch (error) {
    // A user cancelling too late gets a clear 4xx explaining why.
    return sendTransitionError(res, error, 'Failed to cancel request.');
  }
});

module.exports = router;
