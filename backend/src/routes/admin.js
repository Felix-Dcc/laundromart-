const express = require('express');
const config = require('../config');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { sendNotification } = require('../services/notification');
const { transitionOrder, cancelOrder, reassignRider, TransitionError } = require('../services/orderService');
const sm = require('../services/orderStateMachine');
const { logUserStatusChange } = require('../services/audit');
const { emitLaundromatUpdate } = require('../services/realtime');
const { ORDER_INCLUDE, shapeOrder } = require('../lib/orderShape');

const router = express.Router();
const prisma = require('../lib/prisma');

router.use(authenticate, requireAdmin);

function sendTransitionError(res, error, fallback) {
  if (error instanceof TransitionError) return res.status(error.status).json({ error: error.message, code: error.code });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

// Lifecycle groupings for admin monitoring (single OrderStatus).
const ACTIVE_PICKUP = ['awaiting_rider', 'rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up'];
const ACTIVE_SERVICE = ['at_laundromat', 'preparing', 'washing', 'drying', 'ironing'];
const ACTIVE_DELIVERY = ['ready_for_delivery', 'delivery_rider_assigned', 'out_for_delivery'];
const IN_PROCESS = [...ACTIVE_PICKUP, ...ACTIVE_SERVICE, ...ACTIVE_DELIVERY, 'delivered'];

// GET /api/admin/dashboard - Admin dashboard (mirrors admin/dashboard.php)
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      totalRequests,
      pendingRequests,
      inProcessRequests,
      completedRequests,
      totalRevenueResult,
      recentRequests,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count({ where: { userType: 'user' } }),
      prisma.laundryRequest.count(),
      prisma.laundryRequest.count({ where: { status: { in: ['created', 'awaiting_rider'] } } }),
      prisma.laundryRequest.count({ where: { status: { in: IN_PROCESS } } }),
      prisma.laundryRequest.count({ where: { status: 'completed' } }),
      prisma.laundryRequest.aggregate({
        where: { paymentStatus: 'paid' },
        _sum: { totalAmount: true },
      }),
      prisma.laundryRequest.findMany({
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.user.findMany({
        where: { userType: 'user' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    // Active users (with at least one request)
    const activeUsers = await prisma.laundryRequest.findMany({
      select: { userId: true },
      distinct: ['userId'],
    });

    res.json({
      stats: {
        totalUsers,
        activeUsers: activeUsers.length,
        totalRequests,
        pendingRequests,
        inProcessRequests,
        completedRequests,
        totalRevenue: totalRevenueResult._sum.totalAmount || 0,
      },
      recentRequests: recentRequests.map((r) => shapeOrder(r, { role: req.user.userType })),
      recentUsers,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
});

// GET /api/admin/users - List all users (mirrors admin/users.php)
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = config.app.recordsPerPage;
    const offset = (page - 1) * limit;
    const { status, search, userType } = req.query;

    const where = {};
    if (userType) {
      where.userType = userType;
    } else {
      where.userType = { in: ['user', 'provider'] };
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, totalRecords] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          address: true,
          userType: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { laundryRequests: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// GET /api/admin/users/:id - User details (mirrors admin/user-details.php)
router.get('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        address: true,
        userType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Get user stats
    const stats = await prisma.laundryRequest.aggregate({
      where: { userId },
      _count: true,
      _sum: { totalAmount: true },
      _avg: { totalAmount: true },
    });

    // Recent requests
    const recentRequests = await prisma.laundryRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({
      user,
      stats: {
        totalRequests: stats._count,
        totalSpent: stats._sum.totalAmount || 0,
        avgOrderValue: stats._avg.totalAmount || 0,
      },
      recentRequests,
    });
  } catch (error) {
    console.error('User details error:', error);
    res.status(500).json({ error: 'Failed to load user details.' });
  }
});

// ============================================================
// Dispatch settings — configurable rider dispatch + routing
// ============================================================
const { getDispatchSettings, setDispatchSettings } = require('../services/dispatch');

router.get('/settings/dispatch', async (req, res) => {
  try {
    res.json(await getDispatchSettings());
  } catch (error) {
    console.error('Get dispatch settings error:', error);
    res.status(500).json({ error: 'Failed to load dispatch settings.' });
  }
});

// Super admin only: dispatch config governs how work is assigned platform-wide.
router.put('/settings/dispatch', requireSuperAdmin, async (req, res) => {
  try {
    const patch = {};
    const { maxActiveTasks, maxPickupRadiusKm, routeOptimization, distanceLimitKm } = req.body;

    if (maxActiveTasks !== undefined) {
      const v = parseInt(maxActiveTasks, 10);
      if (!Number.isFinite(v) || v < 1 || v > 10) return res.status(400).json({ error: 'maxActiveTasks must be 1–10.' });
      patch.maxActiveTasks = v;
    }
    if (maxPickupRadiusKm !== undefined) {
      const v = parseFloat(maxPickupRadiusKm);
      if (!Number.isFinite(v) || v < 1 || v > 200) return res.status(400).json({ error: 'maxPickupRadiusKm must be 1–200.' });
      patch.maxPickupRadiusKm = v;
    }
    if (distanceLimitKm !== undefined) {
      const v = parseFloat(distanceLimitKm);
      if (!Number.isFinite(v) || v < 1 || v > 500) return res.status(400).json({ error: 'distanceLimitKm must be 1–500.' });
      patch.distanceLimitKm = v;
    }
    if (routeOptimization !== undefined) {
      if (!['distance', 'duration'].includes(routeOptimization)) return res.status(400).json({ error: "routeOptimization must be 'distance' or 'duration'." });
      patch.routeOptimization = routeOptimization;
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No valid settings provided.' });

    const updated = await setDispatchSettings(patch);
    res.json({ message: 'Dispatch settings updated.', ...updated });
  } catch (error) {
    console.error('Update dispatch settings error:', error);
    res.status(500).json({ error: 'Failed to update dispatch settings.' });
  }
});

// PUT /api/admin/users/:id/toggle-status - Toggle user status (mirrors admin/users.php POST)
router.put('/users/:id/toggle-status', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    await prisma.user.update({
      where: { id: userId },
      data: { status: newStatus },
    });

    const message = newStatus === 'active'
      ? 'Your account has been activated.'
      : 'Your account has been deactivated.';
    await sendNotification(
      userId,
      'Account Status Updated',
      message,
      newStatus === 'active' ? 'success' : 'warning'
    );

    // Log audit event
    await logUserStatusChange(user, user.status, newStatus, req.user.id, req);

    // Emit real-time update if this is a provider
    if (user.userType === 'provider') {
      const { cacheDel, KEYS } = require('../lib/cache');
      await cacheDel(KEYS.activeProviders); // membership changed → drop cache
      emitLaundromatUpdate(newStatus === 'active' ? 'added' : 'deleted', {
        id: user.id,
        businessName: user.businessName || `${user.firstName}'s Laundry`,
        address: user.address,
        latitude: user.latitude,
        longitude: user.longitude,
        businessHours: user.businessHours,
        avgRating: user.avgRating,
        reviewCount: user.reviewCount,
      });
    }

    res.json({ message: `User status updated to ${newStatus}.`, status: newStatus });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// GET /api/admin/orders - All orders (mirrors admin/requests.php)
router.get('/orders', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = config.app.recordsPerPage;
    const offset = (page - 1) * limit;
    const { status, search, userId, dateFrom, dateTo } = req.query;

    const where = {};

    if (status) where.status = status;
    if (userId) where.userId = parseInt(userId);

    if (search) {
      where.OR = [
        { requestNumber: { contains: search, mode: 'insensitive' } },
        { laundryType: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
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
    console.error('Admin orders error:', error);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

// GET /api/admin/orders/:id - Canonical order details for admin
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.laundryRequest.findUnique({ where: { id: parseInt(req.params.id) }, include: ORDER_INCLUDE });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const shaped = shapeOrder(order, { role: req.user.userType });
    res.json({ request: shaped, eta: shaped.eta });
  } catch (error) {
    console.error('Admin order details error:', error);
    res.status(500).json({ error: 'Failed to load order details.' });
  }
});

// PUT /api/admin/orders/:id/status - Admin dispute powers only.
// The state machine restricts admins to cancelled / failed / refunded; a
// regular admin cannot perform rider/provider operational steps. Super admins
// may make any valid transition.
router.put('/orders/:id/status', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { newStatus, adminNotes } = req.body;
    if (!newStatus) return res.status(400).json({ error: 'New status is required.' });

    const actor = { id: req.user.id, role: req.user.userType, name: `${req.user.firstName} ${req.user.lastName}` };

    // Cancel goes through the wrapper so riders are freed correctly.
    const shaped = newStatus === 'cancelled'
      ? await cancelOrder({ orderId: requestId, actor, notes: adminNotes || 'Cancelled by admin.', req })
      : await transitionOrder({ orderId: requestId, to: newStatus, actor, notes: adminNotes || null, req });

    res.json({ message: 'Order status updated successfully.', order: shaped, eta: shaped.eta });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to update request status.');
  }
});

// PUT /api/admin/orders/:id/reassign-rider - Move the pickup to another rider
router.put('/orders/:id/reassign-rider', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { riderId } = req.body;
    if (!riderId) return res.status(400).json({ error: 'riderId is required.' });

    const actor = { id: req.user.id, role: req.user.userType, name: `${req.user.firstName} ${req.user.lastName}` };
    const shaped = await reassignRider({ orderId: requestId, newRiderId: parseInt(riderId), actor, req });
    res.json({ message: 'Rider reassigned successfully.', order: shaped });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to reassign rider.');
  }
});

// GET /api/admin/riders - Active riders (for reassignment pickers)
router.get('/riders', async (req, res) => {
  try {
    const riders = await prisma.user.findMany({
      where: { userType: 'rider', status: 'active' },
      select: { id: true, firstName: true, lastName: true, phone: true, riderStatus: true, totalPickups: true },
      orderBy: { firstName: 'asc' },
    });
    res.json({ riders });
  } catch (error) {
    console.error('Admin riders error:', error);
    res.status(500).json({ error: 'Failed to load riders.' });
  }
});

// ============================================================
// GET /api/admin/audit-logs — View audit logs (admin only)
// ============================================================
router.get('/audit-logs', async (req, res) => {
  try {
    const {
      page = '1',
      limit = '50',
      actionType,
      entityType,
      userId,
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    if (actionType) {
      where.actionType = actionType;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (userId) {
      where.userId = parseInt(userId);
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // Include the entire end date
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // Fetch audit logs with user info
    const [logs, totalRecords] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              userType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Parse metadata JSON strings
    const logsWithParsedMetadata = logs.map((log) => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }));

    res.json({
      logs: logsWithParsedMetadata,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum),
      },
    });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

module.exports = router;
