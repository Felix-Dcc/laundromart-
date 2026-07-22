const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { logAuditEvent } = require('../services/audit');
const { sendNotification } = require('../services/notification');
const { ORDER_INCLUDE, shapeOrder } = require('../lib/orderShape');

const router = express.Router();
const prisma = require('../lib/prisma');

// Admin + super admin can read/manage; destructive ops require super admin.
router.use(authenticate, requireAdmin);

// Non-terminal order statuses = "active" on the platform.
const TERMINAL = ['completed', 'cancelled', 'failed', 'refunded'];
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d; };
const num = (v) => (v == null ? 0 : Number(v));

// ============================================================
// GET /api/superadmin/overview — executive KPIs
// ============================================================
router.get('/overview', async (req, res) => {
  try {
    const today = startOfToday();
    const month = startOfMonth();
    const lastMonthStart = new Date(month); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    const [
      revTotal, revToday, revMonth,
      activeOrders, completedOrders, cancelledOrders, totalOrders, todayOrders,
      totalUsers, totalProviders, totalRiders,
      onlineRiders, busyRiders, activeProviders, verifiedProviders,
      pendingProviders, pendingRiders,
      newUsersToday, newUsersThisMonth, newUsersLastMonth,
      ratingAgg, deliveryRows,
    ] = await Promise.all([
      prisma.transaction.aggregate({ where: { status: 'paid' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { status: 'paid', paidAt: { gte: today } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { status: 'paid', paidAt: { gte: month } }, _sum: { amount: true } }),
      prisma.laundryRequest.count({ where: { status: { notIn: TERMINAL } } }),
      prisma.laundryRequest.count({ where: { status: 'completed' } }),
      prisma.laundryRequest.count({ where: { status: 'cancelled' } }),
      prisma.laundryRequest.count(),
      prisma.laundryRequest.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { userType: 'user' } }),
      prisma.user.count({ where: { userType: 'provider' } }),
      prisma.user.count({ where: { userType: 'rider' } }),
      prisma.user.count({ where: { userType: 'rider', riderStatus: 'online' } }),
      prisma.user.count({ where: { userType: 'rider', riderStatus: 'busy' } }),
      prisma.user.count({ where: { userType: 'provider', status: 'active', acceptingOrders: true } }),
      prisma.user.count({ where: { userType: 'provider', isVerified: true } }),
      prisma.user.count({ where: { userType: 'provider', providerApproved: false } }),
      prisma.user.count({ where: { userType: 'rider', riderApproved: false } }),
      prisma.user.count({ where: { userType: 'user', createdAt: { gte: today } } }),
      prisma.user.count({ where: { userType: 'user', createdAt: { gte: month } } }),
      prisma.user.count({ where: { userType: 'user', createdAt: { gte: lastMonthStart, lt: month } } }),
      prisma.review.aggregate({ _avg: { rating: true }, _count: true }).catch(() => ({ _avg: { rating: null }, _count: 0 })),
      prisma.$queryRaw`SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60.0)::float AS mins
                       FROM laundry_requests WHERE status = 'completed'`.catch(() => [{ mins: null }]),
    ]);

    const growth = newUsersLastMonth > 0
      ? Math.round(((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 1000) / 10
      : (newUsersThisMonth > 0 ? 100 : 0);
    const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 1000) / 10 : 0;
    const cancellationRate = totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 1000) / 10 : 0;
    const avgDeliveryMins = deliveryRows?.[0]?.mins != null ? Math.round(deliveryRows[0].mins) : null;

    res.json({
      revenue: { total: num(revTotal._sum.amount), today: num(revToday._sum.amount), month: num(revMonth._sum.amount) },
      orders: { active: activeOrders, completed: completedOrders, cancelled: cancelledOrders, total: totalOrders, today: todayOrders, completionRate, cancellationRate },
      users: { total: totalUsers, newToday: newUsersToday },
      providers: { total: totalProviders, active: activeProviders, verified: verifiedProviders, pending: pendingProviders },
      riders: { total: totalRiders, online: onlineRiders, busy: busyRiders, active: onlineRiders + busyRiders, pending: pendingRiders },
      quality: { avgRating: ratingAgg._avg.rating != null ? Math.round(ratingAgg._avg.rating * 100) / 100 : null, reviewCount: ratingAgg._count || 0, avgDeliveryMins },
      growth,
    });
  } catch (error) {
    console.error('Overview error:', error);
    res.status(500).json({ error: 'Failed to load overview.' });
  }
});

// ============================================================
// GET /api/superadmin/timeseries?days=14 — charts data
// ============================================================
router.get('/timeseries', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(7, parseInt(req.query.days) || 14));
    const since = daysAgo(days - 1);

    const [revRows, orderRows, userRows, peakRows] = await Promise.all([
      prisma.$queryRaw`SELECT to_char(date_trunc('day', paid_at), 'YYYY-MM-DD') AS day, COALESCE(SUM(amount),0) AS v
                       FROM transactions WHERE status='paid' AND paid_at >= ${since} GROUP BY day ORDER BY day`,
      prisma.$queryRaw`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS v
                       FROM laundry_requests WHERE created_at >= ${since} GROUP BY day ORDER BY day`,
      prisma.$queryRaw`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, user_type::text AS t, COUNT(*)::int AS v
                       FROM users WHERE created_at >= ${since} GROUP BY day, t ORDER BY day`,
      prisma.$queryRaw`SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS v
                       FROM laundry_requests GROUP BY hour ORDER BY hour`,
    ]);

    // Build a dense day axis so charts never have gaps.
    const axis = [];
    for (let i = 0; i < days; i++) { const d = new Date(since); d.setDate(d.getDate() + i); axis.push(d.toISOString().slice(0, 10)); }
    const mapBy = (rows, key = 'v') => Object.fromEntries(rows.map((r) => [r.day, Number(r[key])]));
    const rev = mapBy(revRows); const ord = mapBy(orderRows);
    const growthByType = { user: {}, provider: {}, rider: {} };
    userRows.forEach((r) => { if (growthByType[r.t]) growthByType[r.t][r.day] = Number(r.v); });

    const series = axis.map((day) => ({
      day: day.slice(5), // MM-DD
      revenue: rev[day] || 0,
      orders: ord[day] || 0,
      users: growthByType.user[day] || 0,
      providers: growthByType.provider[day] || 0,
      riders: growthByType.rider[day] || 0,
    }));

    const peak = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, orders: 0 }));
    peakRows.forEach((r) => { if (peak[r.hour]) peak[r.hour].orders = Number(r.v); });

    res.json({ days, series, peakHours: peak });
  } catch (error) {
    console.error('Timeseries error:', error);
    res.status(500).json({ error: 'Failed to load chart data.' });
  }
});

// ============================================================
// GET /api/superadmin/live-ops — real-time operations snapshot
// ============================================================
router.get('/live-ops', async (req, res) => {
  try {
    const [riders, orders, laundromats] = await Promise.all([
      prisma.user.findMany({
        where: { userType: 'rider', riderStatus: { in: ['online', 'busy'] } },
        select: { id: true, firstName: true, lastName: true, phone: true, latitude: true, longitude: true, riderStatus: true, lastLocationUpdate: true, totalPickups: true },
      }),
      prisma.laundryRequest.findMany({
        where: { status: { notIn: TERMINAL } },
        include: ORDER_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 200,
      }),
      prisma.user.findMany({
        where: { userType: 'provider', status: 'active', latitude: { not: null }, longitude: { not: null } },
        select: { id: true, businessName: true, firstName: true, lastName: true, address: true, latitude: true, longitude: true, acceptingOrders: true, isVerified: true },
      }),
    ]);

    res.json({
      riders: riders.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, phone: r.phone, latitude: r.latitude, longitude: r.longitude, status: r.riderStatus, lastUpdate: r.lastLocationUpdate, totalPickups: r.totalPickups })),
      orders: orders.map((o) => shapeOrder(o, { role: req.user.userType })),
      laundromats: laundromats.map((p) => ({ id: p.id, name: p.businessName || `${p.firstName} ${p.lastName}'s Laundry`, address: p.address, latitude: p.latitude, longitude: p.longitude, acceptingOrders: p.acceptingOrders, isVerified: p.isVerified })),
    });
  } catch (error) {
    console.error('Live-ops error:', error);
    res.status(500).json({ error: 'Failed to load live operations.' });
  }
});

// ============================================================
// PROVIDERS — list + approve / verify / suspend
// ============================================================
router.get('/providers', async (req, res) => {
  try {
    const { search } = req.query;
    const where = { userType: 'provider' };
    if (search) where.OR = [
      { businessName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
    ];
    const providers = await prisma.user.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, address: true,
        businessName: true, businessHours: true, status: true, acceptingOrders: true,
        providerApproved: true, isVerified: true, avgRating: true, reviewCount: true, createdAt: true,
        _count: { select: { providerOrders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Earnings per provider (paid transactions on their orders).
    const shaped = await Promise.all(providers.map(async (p) => {
      const rev = await prisma.transaction.aggregate({
        where: { status: 'paid', order: { providerId: p.id } }, _sum: { amount: true },
      });
      return {
        id: p.id, name: p.businessName || `${p.firstName} ${p.lastName}`,
        firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, address: p.address,
        businessHours: p.businessHours, status: p.status, acceptingOrders: p.acceptingOrders,
        approved: p.providerApproved, verified: p.isVerified,
        rating: p.avgRating, reviewCount: p.reviewCount, orders: p._count.providerOrders,
        earnings: num(rev._sum.amount), createdAt: p.createdAt,
      };
    }));
    res.json({ providers: shaped });
  } catch (error) {
    console.error('Providers list error:', error);
    res.status(500).json({ error: 'Failed to load providers.' });
  }
});

// Create a laundromat directly from the dashboard (admin-onboarded →
// approved, verified and open, so it's immediately bookable by customers).
router.post('/providers', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, businessName, businessHours, latitude, longitude } = req.body;
    if (!firstName || !lastName || !email || !password || !businessName) {
      return res.status(400).json({ error: 'First name, last name, email, password and business name are required.' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const cleanEmail = String(email).trim().toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (exists) return res.status(400).json({ error: 'Email is already registered.' });

    // A parseable "H:MM AM – H:MM PM" range keeps the open/closed gate working.
    const hours = (businessHours && String(businessHours).trim()) || '7:00 AM – 9:00 PM';
    const lat = latitude != null && latitude !== '' ? parseFloat(latitude) : null;
    const lng = longitude != null && longitude !== '' ? parseFloat(longitude) : null;

    const created = await prisma.user.create({
      data: {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: cleanEmail,
        phone: (phone ? String(phone) : '0000000000').trim(),
        address: String(businessName).trim(),
        password: await bcrypt.hash(String(password), 10),
        userType: 'provider',
        businessName: String(businessName).trim(),
        businessHours: hours,
        latitude: lat,
        longitude: lng,
        status: 'active',
        acceptingOrders: true,   // open for orders
        providerApproved: true,  // admin-onboarded → approved
        isVerified: true,        // and verified
        emailVerified: true,
      },
    });
    const { cacheDel, KEYS } = require('../lib/cache');
    await cacheDel(KEYS.activeProviders).catch(() => {});
    await logAuditEvent({
      userId: req.user.id, actionType: 'USER_CREATED', entityType: 'user', entityId: created.id,
      description: `${req.user.firstName} created laundromat "${created.businessName}" (${created.email})`,
      ipAddress: req.ip, userAgent: req.get?.('user-agent'),
    });
    res.status(201).json({ message: 'Provider created.', provider: { id: created.id, email: created.email, hasLocation: lat != null && lng != null } });
  } catch (error) {
    console.error('Create provider error:', error);
    res.status(500).json({ error: 'Failed to create provider.' });
  }
});

router.patch('/providers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const p = await prisma.user.findFirst({ where: { id, userType: 'provider' } });
    if (!p) return res.status(404).json({ error: 'Provider not found.' });

    const data = {};
    if (typeof req.body.approved === 'boolean') data.providerApproved = req.body.approved;
    if (typeof req.body.verified === 'boolean') data.isVerified = req.body.verified;
    if (req.body.status === 'active' || req.body.status === 'inactive') data.status = req.body.status;
    if (req.body.businessHours) data.businessHours = String(req.body.businessHours).trim();
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields.' });

    const updated = await prisma.user.update({ where: { id }, data });
    const { cacheDel, KEYS } = require('../lib/cache');
    await cacheDel(KEYS.activeProviders).catch(() => {});

    await logAuditEvent({
      userId: req.user.id, actionType: 'USER_UPDATED', entityType: 'user', entityId: id,
      description: `${req.user.firstName} updated provider ${updated.businessName || updated.email}: ${Object.keys(data).join(', ')}`,
      metadata: data, ipAddress: req.ip, userAgent: req.get?.('user-agent'),
    });
    res.json({ message: 'Provider updated.', provider: { id, ...data } });
  } catch (error) {
    console.error('Provider update error:', error);
    res.status(500).json({ error: 'Failed to update provider.' });
  }
});

// ============================================================
// RIDERS — list + approve / suspend + performance
// ============================================================
router.get('/riders', async (req, res) => {
  try {
    const riders = await prisma.user.findMany({
      where: { userType: 'rider' },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, status: true,
        riderStatus: true, riderApproved: true, totalPickups: true, totalEarnings: true,
        latitude: true, longitude: true, lastLocationUpdate: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      riders: riders.map((r) => ({
        id: r.id, name: `${r.firstName} ${r.lastName}`, email: r.email, phone: r.phone,
        status: r.status, riderStatus: r.riderStatus, approved: r.riderApproved,
        totalPickups: r.totalPickups, totalEarnings: num(r.totalEarnings),
        latitude: r.latitude, longitude: r.longitude, lastUpdate: r.lastLocationUpdate, createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Riders list error:', error);
    res.status(500).json({ error: 'Failed to load riders.' });
  }
});

// Create a rider directly from the dashboard (admin-onboarded → pre-approved).
router.post('/riders', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'First name, last name, email and password are required.' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const cleanEmail = String(email).trim().toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (exists) return res.status(400).json({ error: 'Email is already registered.' });

    const created = await prisma.user.create({
      data: {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: cleanEmail,
        phone: (phone ? String(phone) : '0000000000').trim(),
        address: 'Rider',
        password: await bcrypt.hash(String(password), 10),
        userType: 'rider',
        status: 'active',
        riderApproved: true,    // onboarded by an admin → approved to work
        riderStatus: 'offline', // rider goes online from the app
        emailVerified: true,
      },
    });
    await logAuditEvent({
      userId: req.user.id, actionType: 'USER_CREATED', entityType: 'user', entityId: created.id,
      description: `${req.user.firstName} created rider ${created.firstName} ${created.lastName} (${created.email})`,
      ipAddress: req.ip, userAgent: req.get?.('user-agent'),
    });
    res.status(201).json({ message: 'Rider created.', rider: { id: created.id, email: created.email } });
  } catch (error) {
    console.error('Create rider error:', error);
    res.status(500).json({ error: 'Failed to create rider.' });
  }
});

router.patch('/riders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const r = await prisma.user.findFirst({ where: { id, userType: 'rider' } });
    if (!r) return res.status(404).json({ error: 'Rider not found.' });
    const data = {};
    if (typeof req.body.approved === 'boolean') data.riderApproved = req.body.approved;
    if (req.body.status === 'active' || req.body.status === 'inactive') data.status = req.body.status;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields.' });
    await prisma.user.update({ where: { id }, data });
    await logAuditEvent({
      userId: req.user.id, actionType: 'USER_UPDATED', entityType: 'user', entityId: id,
      description: `${req.user.firstName} updated rider ${r.firstName} ${r.lastName}: ${Object.keys(data).join(', ')}`,
      metadata: data, ipAddress: req.ip, userAgent: req.get?.('user-agent'),
    });
    res.json({ message: 'Rider updated.', rider: { id, ...data } });
  } catch (error) {
    console.error('Rider update error:', error);
    res.status(500).json({ error: 'Failed to update rider.' });
  }
});

// ============================================================
// USERS — edit / delete / reset password
// ============================================================
router.patch('/users/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) return res.status(404).json({ error: 'User not found.' });
    const data = {};
    ['firstName', 'lastName', 'phone', 'address'].forEach((k) => { if (req.body[k] != null) data[k] = String(req.body[k]).trim(); });
    if (req.body.status === 'active' || req.body.status === 'inactive') data.status = req.body.status;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields.' });
    await prisma.user.update({ where: { id }, data });
    await logAuditEvent({
      userId: req.user.id, actionType: 'USER_UPDATED', entityType: 'user', entityId: id,
      description: `${req.user.firstName} edited ${u.email}: ${Object.keys(data).join(', ')}`,
      metadata: data, ipAddress: req.ip, userAgent: req.get?.('user-agent'),
    });
    res.json({ message: 'User updated.' });
  } catch (error) {
    console.error('User edit error:', error);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// Reset password → returns a temporary password (super admin only).
router.post('/users/:id/reset-password', requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) return res.status(404).json({ error: 'User not found.' });
    const temp = 'Lms-' + Math.random().toString(36).slice(2, 8);
    await prisma.user.update({ where: { id }, data: { password: await bcrypt.hash(temp, 10) } });
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await logAuditEvent({
      userId: req.user.id, actionType: 'USER_UPDATED', entityType: 'user', entityId: id,
      description: `${req.user.firstName} reset password for ${u.email}`, ipAddress: req.ip, userAgent: req.get?.('user-agent'),
    });
    res.json({ message: 'Password reset.', temporaryPassword: temp });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Delete a user (super admin only). Cannot delete other admins/super admins here.
router.delete('/users/:id', requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u) return res.status(404).json({ error: 'User not found.' });
    await prisma.user.delete({ where: { id } });
    await logAuditEvent({
      userId: req.user.id, actionType: 'USER_DELETED', entityType: 'user', entityId: id,
      description: `${req.user.firstName} deleted ${u.userType} ${u.email}`, ipAddress: req.ip, userAgent: req.get?.('user-agent'),
    });
    res.json({ message: 'User deleted.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ============================================================
// GET /api/superadmin/system-health — lightweight status board
// ============================================================
router.get('/system-health', async (req, res) => {
  try {
    let db = 'up';
    try { await prisma.$queryRaw`SELECT 1`; } catch (e) { db = 'down'; }
    const mem = process.memoryUsage();
    const config = require('../config');
    res.json({
      api: 'up',
      database: db,
      socketio: 'up',
      paymentGateway: config.payments.paystackSecret ? 'configured' : 'stub',
      uptimeSeconds: Math.round(process.uptime()),
      memory: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), heapTotalMb: Math.round(mem.heapTotal / 1048576) },
      node: process.version,
      env: config.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load system health.' });
  }
});

// ============================================================
// PAYMENTS — all transactions + summary + filters
// ============================================================
router.get('/payments', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const { status, method, search } = req.query;
    const where = {};
    if (status) where.status = status;
    if (method) where.method = method;
    if (search) where.OR = [
      { reference: { contains: search, mode: 'insensitive' } },
      { order: { requestNumber: { contains: search, mode: 'insensitive' } } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
    ];

    const [transactions, total, revenue, refunds, failed, pending] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { order: { select: { requestNumber: true, provider: { select: { businessName: true, firstName: true } } } }, user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' }, take: limit, skip: (page - 1) * limit,
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.aggregate({ where: { status: 'paid' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { status: 'refunded' }, _sum: { amount: true } }),
      prisma.transaction.count({ where: { status: 'failed' } }),
      prisma.transaction.count({ where: { status: 'pending' } }),
    ]);

    res.json({
      transactions: transactions.map((t) => ({
        id: t.id, reference: t.reference, orderNumber: t.order?.requestNumber,
        provider: t.order?.provider?.businessName || t.order?.provider?.firstName || null,
        customer: t.user ? `${t.user.firstName} ${t.user.lastName}` : null, email: t.user?.email,
        amount: num(t.amount), currency: t.currency, method: t.method, channel: t.channel,
        status: t.status, paidAt: t.paidAt, createdAt: t.createdAt,
      })),
      pagination: { page, total, totalPages: Math.ceil(total / limit) },
      summary: { revenue: num(revenue._sum.amount), refunds: num(refunds._sum.amount), failed, pending },
    });
  } catch (error) {
    console.error('Payments error:', error);
    res.status(500).json({ error: 'Failed to load payments.' });
  }
});

// ============================================================
// REVIEWS — moderation (list + delete)
// ============================================================
router.get('/reviews', async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      include: {
        user: { select: { firstName: true, lastName: true } },
        provider: { select: { businessName: true, firstName: true, lastName: true } },
        order: { select: { requestNumber: true } },
      },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
    res.json({
      reviews: reviews.map((r) => ({
        id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt,
        author: r.user ? `${r.user.firstName} ${r.user.lastName}` : 'Unknown',
        provider: r.provider?.businessName || (r.provider ? `${r.provider.firstName} ${r.provider.lastName}` : 'Unknown'),
        orderNumber: r.order?.requestNumber,
      })),
    });
  } catch (error) {
    console.error('Reviews error:', error);
    res.status(500).json({ error: 'Failed to load reviews.' });
  }
});

router.delete('/reviews/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) return res.status(404).json({ error: 'Review not found.' });
    await prisma.review.delete({ where: { id } });
    // Recompute the provider's rating from the remaining reviews.
    const agg = await prisma.review.aggregate({ where: { providerId: review.providerId }, _avg: { rating: true }, _count: true });
    await prisma.user.update({ where: { id: review.providerId }, data: { avgRating: agg._avg.rating || 0, reviewCount: agg._count } });
    await logAuditEvent({ userId: req.user.id, actionType: 'REVIEW_DELETED', entityType: 'review', entityId: id, description: `${req.user.firstName} removed a review`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: 'Review removed.' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ error: 'Failed to remove review.' });
  }
});

// ============================================================
// BROADCAST — notify an audience
// ============================================================
router.post('/broadcast', async (req, res) => {
  try {
    const { audience, title, message } = req.body;
    if (!title?.trim() || !message?.trim()) return res.status(400).json({ error: 'Title and message are required.' });
    const AUD = ['all', 'user', 'provider', 'rider', 'admin'];
    if (!AUD.includes(audience)) return res.status(400).json({ error: 'Invalid audience.' });

    const where = { status: 'active' };
    if (audience === 'admin') where.userType = { in: ['admin', 'superadmin'] };
    else if (audience !== 'all') where.userType = audience;

    const recipients = await prisma.user.findMany({ where, select: { id: true } });
    // Fan out (best-effort). category 'system' so it bypasses order-update muting.
    await Promise.all(recipients.map((u) => sendNotification(u.id, title.trim(), message.trim(), 'info', { category: 'system' })));
    await logAuditEvent({ userId: req.user.id, actionType: 'SETTING_UPDATED', entityType: 'broadcast', description: `${req.user.firstName} broadcast "${title}" to ${audience} (${recipients.length})`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: `Broadcast sent to ${recipients.length} recipient(s).`, sent: recipients.length });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Failed to send broadcast.' });
  }
});

// ============================================================
// ADMINS — list + CRUD (create/edit/delete are super-admin only)
// ============================================================
router.get('/admins', async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { userType: { in: ['admin', 'superadmin'] } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, userType: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ admins });
  } catch (error) {
    console.error('Admins list error:', error);
    res.status(500).json({ error: 'Failed to load admins.' });
  }
});

router.post('/admins', requireSuperAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, role } = req.body;
    if (!firstName || !lastName || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const userType = role === 'superadmin' ? 'superadmin' : 'admin';
    const exists = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (exists) return res.status(400).json({ error: 'Email is already registered.' });
    const created = await prisma.user.create({
      data: {
        firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(),
        phone: (phone || '0000000000').trim(), address: 'Admin', password: await bcrypt.hash(password, 10),
        userType, status: 'active', emailVerified: true,
      },
    });
    await logAuditEvent({ userId: req.user.id, actionType: 'USER_CREATED', entityType: 'user', entityId: created.id, description: `${req.user.firstName} created ${userType} ${created.email}`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.status(201).json({ message: 'Admin created.', admin: { id: created.id, email: created.email } });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Failed to create admin.' });
  }
});

router.patch('/admins/:id', requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const u = await prisma.user.findFirst({ where: { id, userType: { in: ['admin', 'superadmin'] } } });
    if (!u) return res.status(404).json({ error: 'Admin not found.' });
    const data = {};
    ['firstName', 'lastName', 'phone'].forEach((k) => { if (req.body[k] != null) data[k] = String(req.body[k]).trim(); });
    if (req.body.status === 'active' || req.body.status === 'inactive') {
      if (id === req.user.id && req.body.status === 'inactive') return res.status(400).json({ error: 'You cannot suspend yourself.' });
      data.status = req.body.status;
    }
    if (req.body.role === 'admin' || req.body.role === 'superadmin') data.userType = req.body.role;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields.' });
    await prisma.user.update({ where: { id }, data });
    await logAuditEvent({ userId: req.user.id, actionType: 'USER_UPDATED', entityType: 'user', entityId: id, description: `${req.user.firstName} updated admin ${u.email}`, metadata: data, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: 'Admin updated.' });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ error: 'Failed to update admin.' });
  }
});

router.delete('/admins/:id', requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const u = await prisma.user.findFirst({ where: { id, userType: { in: ['admin', 'superadmin'] } } });
    if (!u) return res.status(404).json({ error: 'Admin not found.' });
    await prisma.user.delete({ where: { id } });
    await logAuditEvent({ userId: req.user.id, actionType: 'USER_DELETED', entityType: 'user', entityId: id, description: `${req.user.firstName} deleted admin ${u.email}`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: 'Admin deleted.' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ error: 'Failed to delete admin.' });
  }
});

// ============================================================
// PLATFORM SETTINGS — key/value via SystemSetting
// ============================================================
const SETTINGS = [
  { key: 'commission_percent', label: 'Commission %', def: '15', type: 'number' },
  { key: 'delivery_fee', label: 'Delivery Fee', def: '0', type: 'number' },
  { key: 'service_fee', label: 'Service Fee', def: '0', type: 'number' },
  { key: 'tax_percent', label: 'Tax %', def: '0', type: 'number' },
  { key: 'currency', label: 'Currency', def: 'GHS', type: 'text' },
  { key: 'supported_cities', label: 'Supported Cities', def: 'Cape Coast, Accra', type: 'text' },
  { key: 'business_hours_default', label: 'Default Business Hours', def: '8:00 AM – 8:00 PM', type: 'text' },
  { key: 'max_active_rider_tasks', label: 'Max Rider Tasks', def: '3', type: 'number' },
  { key: 'push_enabled', label: 'Push Notifications', def: 'true', type: 'bool' },
];

router.get('/settings', async (req, res) => {
  try {
    const rows = await prisma.systemSetting.findMany({ where: { settingKey: { in: SETTINGS.map((s) => s.key) } } });
    const map = Object.fromEntries(rows.map((r) => [r.settingKey, r.settingValue]));
    res.json({ settings: SETTINGS.map((s) => ({ ...s, value: map[s.key] ?? s.def })) });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const patch = req.body || {};
    const valid = SETTINGS.map((s) => s.key);
    const entries = Object.entries(patch).filter(([k]) => valid.includes(k));
    if (entries.length === 0) return res.status(400).json({ error: 'No valid settings.' });
    for (const [k, v] of entries) {
      const meta = SETTINGS.find((s) => s.key === k);
      await prisma.systemSetting.upsert({
        where: { settingKey: k }, update: { settingValue: String(v) },
        create: { settingKey: k, settingValue: String(v), description: meta.label },
      });
    }
    // Keep the dispatch cache honest if max-tasks changed.
    if (patch.max_active_rider_tasks != null) { try { require('../services/dispatch').invalidateCache(); } catch (e) {} }
    await logAuditEvent({ userId: req.user.id, actionType: 'SETTING_UPDATED', entityType: 'settings', description: `${req.user.firstName} updated platform settings: ${entries.map(([k]) => k).join(', ')}`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: 'Settings saved.' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

// ============================================================
// ANALYTICS — deeper platform insight
// ============================================================
router.get('/analytics', async (req, res) => {
  try {
    const [byStatus, services, provs, totalOrders, cancelled, revenue, repeat, payMethods, topRiders, acqRows] = await Promise.all([
      prisma.laundryRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.laundryRequest.groupBy({ by: ['laundryType'], _count: { _all: true }, _sum: { totalAmount: true } }),
      prisma.laundryRequest.groupBy({ by: ['providerId'], where: { providerId: { not: null } }, _count: { _all: true }, orderBy: { _count: { providerId: 'desc' } }, take: 8 }),
      prisma.laundryRequest.count(),
      prisma.laundryRequest.count({ where: { status: 'cancelled' } }),
      prisma.transaction.aggregate({ where: { status: 'paid' }, _sum: { amount: true }, _count: true }),
      prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM (SELECT user_id FROM laundry_requests GROUP BY user_id HAVING COUNT(*) >= 2) t`,
      // Payment-method split (paid transactions).
      prisma.transaction.groupBy({ by: ['method'], where: { status: 'paid' }, _count: { _all: true }, _sum: { amount: true } }).catch(() => []),
      // Rider leaderboard.
      prisma.user.findMany({ where: { userType: 'rider' }, select: { firstName: true, lastName: true, totalPickups: true, totalEarnings: true }, orderBy: { totalPickups: 'desc' }, take: 8 }),
      // Customer acquisition — new customers per week, last 12 weeks.
      prisma.$queryRaw`SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS wk, COUNT(*)::int AS v
                       FROM users WHERE user_type = 'user' AND created_at >= NOW() - INTERVAL '12 weeks'
                       GROUP BY wk ORDER BY wk`.catch(() => []),
    ]);

    const provIds = provs.map((p) => p.providerId);
    const provRows = provIds.length ? await prisma.user.findMany({ where: { id: { in: provIds } }, select: { id: true, businessName: true, firstName: true, avgRating: true } }) : [];
    const provOf = Object.fromEntries(provRows.map((p) => [p.id, p]));
    const nameOf = (id) => provOf[id]?.businessName || `${provOf[id]?.firstName || '#' + id}'s Laundry`;

    res.json({
      ordersByStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })).sort((a, b) => b.count - a.count),
      popularServices: services.map((s) => ({ service: s.laundryType, orders: s._count._all, revenue: num(s._sum.totalAmount) })).sort((a, b) => b.orders - a.orders),
      popularLaundromats: provs.map((p) => ({ name: nameOf(p.providerId), orders: p._count._all, rating: num(provOf[p.providerId]?.avgRating) })),
      paymentMethods: payMethods.map((m) => ({ method: (m.method || 'unknown').toUpperCase(), count: m._count._all, revenue: num(m._sum.amount) })),
      riderPerformance: topRiders.map((r) => ({ name: `${r.firstName} ${r.lastName}`, pickups: r.totalPickups || 0, earnings: num(r.totalEarnings) })),
      acquisition: acqRows.map((r) => ({ week: r.wk.slice(5), customers: Number(r.v) })),
      cancellationRate: totalOrders ? Math.round((cancelled / totalOrders) * 1000) / 10 : 0,
      repeatCustomers: repeat[0]?.c || 0,
      totalOrders,
      revenue: num(revenue._sum.amount),
      paidCount: revenue._count,
      avgOrderValue: revenue._count ? Math.round((num(revenue._sum.amount) / revenue._count) * 100) / 100 : 0,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

// ============================================================
// PROMOTIONS — promo codes / discounts
// ============================================================
router.get('/promotions', async (req, res) => {
  try {
    const promos = await prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({
      promotions: promos.map((p) => ({
        id: p.id, code: p.code, description: p.description, type: p.type, value: num(p.value),
        minOrder: num(p.minOrder), maxUses: p.maxUses, usedCount: p.usedCount,
        startsAt: p.startsAt, expiresAt: p.expiresAt, active: p.active, createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error('Promotions error:', error);
    res.status(500).json({ error: 'Failed to load promotions.' });
  }
});

router.post('/promotions', async (req, res) => {
  try {
    const { code, description, type, value, minOrder, maxUses, startsAt, expiresAt } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Code is required.' });
    const t = type === 'fixed' ? 'fixed' : 'percent';
    const val = parseFloat(value);
    if (!Number.isFinite(val) || val <= 0) return res.status(400).json({ error: 'Value must be greater than 0.' });
    if (t === 'percent' && val > 100) return res.status(400).json({ error: 'Percent discount cannot exceed 100.' });
    const normCode = code.trim().toUpperCase().replace(/\s+/g, '');
    const exists = await prisma.promotion.findUnique({ where: { code: normCode } });
    if (exists) return res.status(400).json({ error: 'A promo code with that name already exists.' });

    const created = await prisma.promotion.create({
      data: {
        code: normCode, description: description?.trim() || null, type: t, value: val,
        minOrder: minOrder != null ? parseFloat(minOrder) : 0,
        maxUses: maxUses ? parseInt(maxUses) : null,
        startsAt: startsAt ? new Date(startsAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: req.user.id,
      },
    });
    await logAuditEvent({ userId: req.user.id, actionType: 'SETTING_UPDATED', entityType: 'promotion', entityId: created.id, description: `${req.user.firstName} created promo ${normCode}`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.status(201).json({ message: 'Promotion created.', id: created.id });
  } catch (error) {
    console.error('Create promo error:', error);
    res.status(500).json({ error: 'Failed to create promotion.' });
  }
});

router.patch('/promotions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const p = await prisma.promotion.findUnique({ where: { id } });
    if (!p) return res.status(404).json({ error: 'Promotion not found.' });
    const data = {};
    if (typeof req.body.active === 'boolean') data.active = req.body.active;
    if (req.body.description != null) data.description = String(req.body.description).trim();
    if (req.body.expiresAt !== undefined) data.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    if (req.body.maxUses !== undefined) data.maxUses = req.body.maxUses ? parseInt(req.body.maxUses) : null;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields.' });
    await prisma.promotion.update({ where: { id }, data });
    res.json({ message: 'Promotion updated.' });
  } catch (error) {
    console.error('Update promo error:', error);
    res.status(500).json({ error: 'Failed to update promotion.' });
  }
});

router.delete('/promotions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const p = await prisma.promotion.findUnique({ where: { id } });
    if (!p) return res.status(404).json({ error: 'Promotion not found.' });
    await prisma.promotion.delete({ where: { id } });
    await logAuditEvent({ userId: req.user.id, actionType: 'SETTING_UPDATED', entityType: 'promotion', entityId: id, description: `${req.user.firstName} deleted promo ${p.code}`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: 'Promotion deleted.' });
  } catch (error) {
    console.error('Delete promo error:', error);
    res.status(500).json({ error: 'Failed to delete promotion.' });
  }
});

// ============================================================
// SECURITY — login history, failed attempts, admin sessions
// ============================================================
router.get('/security/overview', async (req, res) => {
  try {
    const dayAgo = new Date(Date.now() - 86400000);
    const [history, failed24h, successToday, sessionsRaw] = await Promise.all([
      prisma.loginAttempt.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: dayAgo } } }),
      prisma.loginAttempt.count({ where: { success: true, createdAt: { gte: startOfToday() } } }),
      prisma.refreshToken.findMany({
        where: { revokedAt: null, expiresAt: { gt: new Date() }, user: { userType: { in: ['admin', 'superadmin'] } } },
        include: { user: { select: { firstName: true, lastName: true, email: true, userType: true } } },
        orderBy: { createdAt: 'desc' }, take: 100,
      }),
    ]);
    res.json({
      loginHistory: history.map((h) => ({ id: h.id, email: h.email, success: h.success, ip: h.ipAddress, device: h.userAgent, at: h.createdAt })),
      failed24h, successToday,
      sessions: sessionsRaw.map((s) => ({ id: s.id, user: `${s.user.firstName} ${s.user.lastName}`, email: s.user.email, role: s.user.userType, createdAt: s.createdAt, expiresAt: s.expiresAt })),
    });
  } catch (error) {
    console.error('Security overview error:', error);
    res.status(500).json({ error: 'Failed to load security data.' });
  }
});

router.post('/security/sessions/:id/revoke', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const s = await prisma.refreshToken.findUnique({ where: { id }, include: { user: { select: { email: true } } } });
    if (!s) return res.status(404).json({ error: 'Session not found.' });
    await prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAuditEvent({ userId: req.user.id, actionType: 'USER_UPDATED', entityType: 'session', entityId: id, description: `${req.user.firstName} force-logged-out a session for ${s.user.email}`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: 'Session revoked.' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session.' });
  }
});

// ============================================================
// PROFILE — the signed-in admin's own account
// ============================================================
router.put('/me', async (req, res) => {
  try {
    const data = {};
    ['firstName', 'lastName', 'phone'].forEach((k) => { if (req.body[k] != null) data[k] = String(req.body[k]).trim(); });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields.' });
    const u = await prisma.user.update({
      where: { id: req.user.id }, data,
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, userType: true, status: true },
    });
    res.json({ message: 'Profile updated.', user: u });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ── Two-factor authentication (TOTP) ──
router.get('/me/2fa', async (req, res) => {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { twofaEnabled: true } });
    res.json({ enabled: !!u.twofaEnabled });
  } catch (e) { res.status(500).json({ error: 'Failed to load 2FA status.' }); }
});

// Generate a fresh secret + QR (not enabled until verified).
router.post('/me/2fa/setup', async (req, res) => {
  try {
    const otp = require('otplib');
    const qrcode = require('qrcode');
    const secret = otp.generateSecret();
    await prisma.user.update({ where: { id: req.user.id }, data: { twofaSecret: secret, twofaEnabled: false } });
    const otpauth = otp.generateURI({ secret, label: req.user.email, issuer: 'Laundromat Admin' });
    const qr = await qrcode.toDataURL(String(otpauth));
    res.json({ secret, otpauth: String(otpauth), qr });
  } catch (e) { console.error('2FA setup error:', e); res.status(500).json({ error: 'Failed to start 2FA setup.' }); }
});

router.post('/me/2fa/enable', async (req, res) => {
  try {
    const otp = require('otplib');
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { twofaSecret: true } });
    if (!u.twofaSecret) return res.status(400).json({ error: 'Start 2FA setup first.' });
    if (!otp.verifySync({ token: String(req.body.token || ''), secret: u.twofaSecret }).valid) {
      return res.status(400).json({ error: 'Invalid code. Check your authenticator app.' });
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { twofaEnabled: true } });
    await logAuditEvent({ userId: req.user.id, actionType: 'USER_UPDATED', entityType: 'user', entityId: req.user.id, description: `${req.user.firstName} enabled two-factor authentication`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: 'Two-factor authentication enabled.' });
  } catch (e) { res.status(500).json({ error: 'Failed to enable 2FA.' }); }
});

router.post('/me/2fa/disable', async (req, res) => {
  try {
    const otp = require('otplib');
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { twofaSecret: true, twofaEnabled: true } });
    if (u.twofaEnabled && u.twofaSecret && !otp.verifySync({ token: String(req.body.token || ''), secret: u.twofaSecret }).valid) {
      return res.status(400).json({ error: 'Invalid code.' });
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { twofaEnabled: false, twofaSecret: null } });
    await logAuditEvent({ userId: req.user.id, actionType: 'USER_UPDATED', entityType: 'user', entityId: req.user.id, description: `${req.user.firstName} disabled two-factor authentication`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: 'Two-factor authentication disabled.' });
  } catch (e) { res.status(500).json({ error: 'Failed to disable 2FA.' }); }
});

router.post('/me/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    const u = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword || '', u.password))) return res.status(400).json({ error: 'Current password is incorrect.' });
    await prisma.user.update({ where: { id: req.user.id }, data: { password: await bcrypt.hash(newPassword, 10) } });
    // Revoke this admin's other sessions after a password change.
    await prisma.refreshToken.updateMany({ where: { userId: req.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await logAuditEvent({ userId: req.user.id, actionType: 'USER_UPDATED', entityType: 'user', entityId: req.user.id, description: `${req.user.firstName} changed their password`, ipAddress: req.ip, userAgent: req.get?.('user-agent') });
    res.json({ message: 'Password changed. Other sessions were signed out.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

module.exports = router;
