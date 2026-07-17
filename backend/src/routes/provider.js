const express = require('express');
const config = require('../config');
const { authenticate, requireProviderOrAdmin } = require('../middleware/auth');
const { transitionOrder, verifyWeight, TransitionError } = require('../services/orderService');
const sm = require('../services/orderStateMachine');
const { ORDER_INCLUDE, shapeOrder } = require('../lib/orderShape');

const router = express.Router();
const prisma = require('../lib/prisma');

router.use(authenticate, requireProviderOrAdmin);

// ============================================================
// QUEUE BUCKETS — derived from the single OrderStatus.
//   pending    : order placed, still on its way to the laundromat
//   inprogress : from the moment the laundry arrives until it's delivered back
//   completed  : delivered to the customer / finished
//   cancelled  : cancelled / failed / refunded
// ============================================================
const QUEUE_PENDING     = ['created', 'awaiting_rider', 'rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up'];
const QUEUE_INPROGRESS  = [
  'at_laundromat', 'weight_verified', 'preparing', 'washing', 'drying', 'ironing',
  'ready_for_delivery', 'delivery_rider_assigned', 'rider_to_laundromat',
  'collected_from_laundromat', 'out_for_delivery', 'rider_arrived_at_customer',
];
const QUEUE_COMPLETED   = ['delivered', 'completed'];
const QUEUE_CANCELLED   = ['cancelled', 'failed', 'refunded'];

const BUCKETS = {
  pending: QUEUE_PENDING,
  inprogress: QUEUE_INPROGRESS,
  completed: QUEUE_COMPLETED,
  cancelled: QUEUE_CANCELLED,
};

// A provider only ever sees the orders routed to them. (Admins see all.)
function scopeToProvider(req, where = {}) {
  if (req.user.userType === 'provider') return { ...where, providerId: req.user.id };
  return where;
}

// ============================================================
// GET /api/provider/dashboard — stats + recent per queue
// ============================================================
router.get('/dashboard', async (req, res) => {
  try {
    const base = scopeToProvider(req);
    const [pendingCount, inProgressCount, completedCount, cancelledCount, totalRequests, awaitingVerifyCount] = await Promise.all([
      prisma.laundryRequest.count({ where: { ...base, status: { in: QUEUE_PENDING } } }),
      prisma.laundryRequest.count({ where: { ...base, status: { in: QUEUE_INPROGRESS } } }),
      prisma.laundryRequest.count({ where: { ...base, status: { in: QUEUE_COMPLETED } } }),
      prisma.laundryRequest.count({ where: { ...base, status: { in: QUEUE_CANCELLED } } }),
      prisma.laundryRequest.count({ where: base }),
      // Orders that need the provider to verify weight right now.
      prisma.laundryRequest.count({ where: { ...base, status: 'at_laundromat' } }),
    ]);

    const [toVerify, inProgress, ready] = await Promise.all([
      // "Verify Laundry" section — orders that just arrived and need weighing.
      prisma.laundryRequest.findMany({ where: { ...base, status: 'at_laundromat' }, include: ORDER_INCLUDE, orderBy: { updatedAt: 'asc' }, take: 5 }),
      prisma.laundryRequest.findMany({ where: { ...base, status: { in: ['weight_verified', 'preparing', 'washing', 'drying', 'ironing'] } }, include: ORDER_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 5 }),
      prisma.laundryRequest.findMany({ where: { ...base, status: { in: ['ready_for_delivery', 'delivery_rider_assigned', 'rider_to_laundromat', 'collected_from_laundromat', 'out_for_delivery', 'rider_arrived_at_customer'] } }, include: ORDER_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 5 }),
    ]);

    const shape = (r) => shapeOrder(r, { role: req.user.userType });
    res.json({
      stats: { pendingCount, inProgressCount, completedCount, cancelledCount, totalRequests, awaitingVerifyCount,
               // aliases kept for backward compat with older mobile builds
               incomingCount: pendingCount },
      queues: { toVerify: toVerify.map(shape), inProgress: inProgress.map(shape), ready: ready.map(shape) },
    });
  } catch (error) {
    console.error('Provider dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
});

// ============================================================
// GET /api/provider/queue/:bucket — paginated queue list
// ============================================================
router.get('/queue/:bucket', async (req, res) => {
  try {
    const { bucket } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = config.app.recordsPerPage;
    const offset = (page - 1) * limit;

    // 'incoming' kept as an alias for 'pending' (older mobile builds).
    const key = bucket === 'incoming' ? 'pending' : bucket;
    const statuses = BUCKETS[key];
    if (!statuses) return res.status(400).json({ error: 'Invalid queue bucket. Use: pending, inprogress, completed, cancelled.' });
    const orderBy = key === 'pending' ? { createdAt: 'asc' } : { updatedAt: 'desc' };

    const where = scopeToProvider(req, { status: { in: statuses } });
    const { search } = req.query;
    if (search) {
      where.OR = [
        { requestNumber: { contains: search, mode: 'insensitive' } },
        { laundryType: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [requests, totalRecords] = await Promise.all([
      prisma.laundryRequest.findMany({ where, include: ORDER_INCLUDE, orderBy, take: limit, skip: offset }),
      prisma.laundryRequest.count({ where }),
    ]);

    res.json({
      bucket,
      requests: requests.map((r) => shapeOrder(r, { role: req.user.userType })),
      pagination: { page, limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) },
    });
  } catch (error) {
    console.error('Queue fetch error:', error);
    res.status(500).json({ error: 'Failed to load queue.' });
  }
});

// ============================================================
// GET /api/provider/orders — generic filtered list (kept for compat)
// ============================================================
router.get('/orders', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = config.app.recordsPerPage;
    const offset = (page - 1) * limit;
    const { status, search } = req.query;

    const where = scopeToProvider(req);
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { requestNumber: { contains: search, mode: 'insensitive' } },
        { laundryType: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [requests, totalRecords] = await Promise.all([
      prisma.laundryRequest.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      prisma.laundryRequest.count({ where }),
    ]);

    res.json({
      requests: requests.map((r) => shapeOrder(r, { role: req.user.userType })),
      pagination: { page, limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) },
    });
  } catch (error) {
    console.error('Provider orders error:', error);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

// ============================================================
// PUT /api/provider/orders/:id/verify-weight — enter the ACTUAL weight.
// Backend recomputes the final price and moves the order to weight_verified.
// Body: { actualWeightKg }
// ============================================================
router.put('/orders/:id/verify-weight', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    await assertProviderOwnsOrder(req, requestId);

    const shaped = await verifyWeight({
      orderId: requestId,
      actor: { id: req.user.id, role: req.user.userType, name: `${req.user.firstName} ${req.user.lastName}` },
      actualWeightKg: req.body.actualWeightKg,
      req,
    });
    res.json({ message: 'Weight verified. Awaiting customer payment.', order: shaped });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to verify weight.');
  }
});

// ============================================================
// PUT /api/provider/orders/:id/status — set an explicit provider status
// (preparing | washing | drying | ironing | ready_for_delivery)
// All validation/ownership/race-safety handled by the OrderService.
// (preparing is payment-gated: rejected with 402 until the customer pays.)
// ============================================================
router.put('/orders/:id/status', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status, adminNotes } = req.body;
    if (!status) return res.status(400).json({ error: 'Target status is required.' });

    await assertProviderOwnsOrder(req, requestId);

    const shaped = await transitionOrder({
      orderId: requestId,
      to: status,
      actor: { id: req.user.id, role: req.user.userType, name: `${req.user.firstName} ${req.user.lastName}` },
      notes: adminNotes || null,
      req,
    });
    res.json({ message: `Order updated to "${sm.labelFor(status)}".`, order: shaped, eta: shaped.eta });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to update status.');
  }
});

// ============================================================
// PUT /api/provider/orders/:id/advance — move to the next forward step
// ============================================================
router.put('/orders/:id/advance', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { adminNotes } = req.body;

    await assertProviderOwnsOrder(req, requestId);

    const order = await prisma.laundryRequest.findUnique({ where: { id: requestId }, select: { status: true } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // The next forward step this provider is allowed to make.
    const actions = sm.allowedActionsFor(order.status, req.user.userType).filter((a) => a.to !== 'cancelled');
    if (actions.length === 0) {
      return res.status(409).json({ error: `No further provider step from "${sm.labelFor(order.status)}".` });
    }
    const next = actions[0].to; // first forward action (drying preferred over ready when applicable)

    const shaped = await transitionOrder({
      orderId: requestId, to: next,
      actor: { id: req.user.id, role: req.user.userType, name: `${req.user.firstName} ${req.user.lastName}` },
      notes: adminNotes || null, req,
    });
    res.json({ message: `Order advanced to "${sm.labelFor(next)}".`, order: shaped, newStatus: next, eta: shaped.eta });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to advance order.');
  }
});

// ============================================================
// GET/PUT /api/provider/accepting-orders — pause/resume new orders
// ============================================================
router.get('/accepting-orders', async (req, res) => {
  try {
    const id = req.user.userType === 'provider' ? req.user.id : parseInt(req.query.providerId);
    if (!id) return res.status(400).json({ error: 'providerId is required.' });
    const p = await prisma.user.findUnique({ where: { id }, select: { acceptingOrders: true } });
    res.json({ acceptingOrders: p?.acceptingOrders !== false });
  } catch (error) {
    console.error('Get accepting-orders error:', error);
    res.status(500).json({ error: 'Failed to load setting.' });
  }
});

router.put('/accepting-orders', async (req, res) => {
  try {
    if (req.user.userType !== 'provider') return res.status(403).json({ error: 'Only a provider can change this.' });
    const acceptingOrders = req.body.acceptingOrders !== false;
    await prisma.user.update({ where: { id: req.user.id }, data: { acceptingOrders } });
    res.json({ message: acceptingOrders ? 'You are now accepting new orders.' : 'New orders paused.', acceptingOrders });
  } catch (error) {
    console.error('Set accepting-orders error:', error);
    res.status(500).json({ error: 'Failed to update setting.' });
  }
});

// Provider may only act on orders routed to them (admins bypass).
async function assertProviderOwnsOrder(req, orderId) {
  if (req.user.userType !== 'provider') return;
  const o = await prisma.laundryRequest.findUnique({ where: { id: orderId }, select: { providerId: true } });
  if (!o) throw new TransitionError('NOT_FOUND', 'Order not found.', 404);
  if (o.providerId !== req.user.id) throw new TransitionError('FORBIDDEN', 'This order is not assigned to your laundromat.', 403);
}

function sendTransitionError(res, error, fallback) {
  if (error instanceof TransitionError) return res.status(error.status).json({ error: error.message, code: error.code });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

module.exports = router;
