const express = require('express');
const { authenticate, requireProviderOrAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

router.use(authenticate, requireProviderOrAdmin);

// ============================================================
// GET /api/analytics?range=today|week|month|all
// Returns aggregated stats — scoped by role
//   admin  → sees ALL orders
//   provider → sees ALL orders (they service the whole platform)
// All queries use Prisma aggregates — zero per-record loops
// ============================================================
router.get('/', async (req, res) => {
  try {
    const range = req.query.range || 'month';
    const dateFilter = getDateFilter(range);
    const where = dateFilter ? { createdAt: { gte: dateFilter } } : {};

    // ── 1. Summary counts (single pass) ──
    const [
      totalOrders,
      deliveredCount,
      cancelledCount,
      pendingCount,
      inProgressCount,
      readyCount,
    ] = await Promise.all([
      prisma.laundryRequest.count({ where }),
      prisma.laundryRequest.count({ where: { ...where, status: 'completed' } }),
      prisma.laundryRequest.count({ where: { ...where, status: 'cancelled' } }),
      prisma.laundryRequest.count({ where: { ...where, status: { in: ['created', 'awaiting_rider'] } } }),
      prisma.laundryRequest.count({ where: { ...where, status: { in: ['rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up', 'at_laundromat', 'preparing', 'washing', 'drying', 'ironing'] } } }),
      prisma.laundryRequest.count({ where: { ...where, status: { in: ['ready_for_delivery', 'delivery_rider_assigned', 'out_for_delivery', 'delivered'] } } }),
    ]);

    // ── 2. Revenue aggregate ──
    const revenueAgg = await prisma.laundryRequest.aggregate({
      where: { ...where, paymentStatus: 'paid' },
      _sum: { totalAmount: true },
      _avg: { totalAmount: true },
      _count: true,
    });

    // ── 3. Orders per day (raw SQL for grouping by date) ──
    const dailyOrders = await getDailyOrders(dateFilter, range);

    // ── 4. Status breakdown (group by) ──
    const statusBreakdown = await prisma.laundryRequest.groupBy({
      by: ['status'],
      where,
      _count: true,
      orderBy: { _count: { status: 'desc' } },
    });

    // ── 5. Service type popularity ──
    const serviceBreakdown = await prisma.laundryRequest.groupBy({
      by: ['laundryType'],
      where,
      _count: true,
      _sum: { totalAmount: true },
      orderBy: { _count: { laundryType: 'desc' } },
    });

    // ── 6. Admin-only: user growth (new registrations in range) ──
    let userStats = null;
    if (req.user.userType === 'admin') {
      const userWhere = dateFilter ? { createdAt: { gte: dateFilter }, userType: 'user' } : { userType: 'user' };
      const [totalUsers, newUsers, activeUsers] = await Promise.all([
        prisma.user.count({ where: { userType: 'user' } }),
        prisma.user.count({ where: userWhere }),
        prisma.laundryRequest.findMany({
          where,
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);
      userStats = { totalUsers, newUsers, activeCustomers: activeUsers.length };
    }

    // ── 7. Provider-only: reviews summary ──
    let reviewStats = null;
    if (req.user.userType === 'provider') {
      const revAgg = await prisma.review.aggregate({
        where: { providerId: req.user.id },
        _avg: { rating: true },
        _count: true,
      });
      reviewStats = {
        avgRating: Math.round((revAgg._avg.rating || 0) * 100) / 100,
        totalReviews: revAgg._count,
      };
    }

    res.json({
      range,
      summary: {
        totalOrders,
        delivered: deliveredCount,
        cancelled: cancelledCount,
        pending: pendingCount,
        inProgress: inProgressCount,
        ready: readyCount,
        completionRate: totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 1000) / 10 : 0,
        cancellationRate: totalOrders > 0 ? Math.round((cancelledCount / totalOrders) * 1000) / 10 : 0,
      },
      revenue: {
        total: revenueAgg._sum.totalAmount || 0,
        average: Math.round((parseFloat(revenueAgg._avg.totalAmount) || 0) * 100) / 100,
        paidOrders: revenueAgg._count,
      },
      dailyOrders,
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s.status,
        count: s._count,
      })),
      serviceBreakdown: serviceBreakdown.map((s) => ({
        service: s.laundryType,
        count: s._count,
        revenue: s._sum.totalAmount || 0,
      })),
      userStats,
      reviewStats,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

// ── Helper: date range filter ──
function getDateFilter(range) {
  const now = new Date();
  switch (range) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start;
    }
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return start;
    }
    case 'all':
    default:
      return null;
  }
}

// ── Helper: daily order counts via raw SQL ──
async function getDailyOrders(dateFilter, range) {
  try {
    let days;
    if (range === 'today') days = 1;
    else if (range === 'week') days = 7;
    else if (range === 'month') days = 30;
    else days = 90;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const results = await prisma.$queryRawUnsafe(`
      SELECT DATE(created_at) as date,
             COUNT(*)::int as orders,
             COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0)::int as delivered,
             COALESCE(SUM(total_amount), 0)::float as revenue
      FROM laundry_requests
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, cutoff);

    return results.map((r) => ({
      date: r.date.toISOString().split('T')[0],
      orders: r.orders,
      delivered: r.delivered,
      revenue: Math.round(r.revenue * 100) / 100,
    }));
  } catch (error) {
    console.error('Daily orders query error:', error.message);
    return [];
  }
}

module.exports = router;
