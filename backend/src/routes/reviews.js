const express = require('express');
const { authenticate, requireUser } = require('../middleware/auth');
const { sendNotification } = require('../services/notification');
const { logReviewSubmitted } = require('../services/audit');

const router = express.Router();
const prisma = require('../lib/prisma');

// ============================================================
// POST /api/reviews — Submit a review (ONLY after delivery)
// ============================================================
router.post('/', authenticate, requireUser, async (req, res) => {
  try {
    const { orderId, providerId, rating, comment } = req.body;

    // ── Validate input ──
    if (!orderId || !providerId) {
      return res.status(400).json({ error: 'orderId and providerId are required.' });
    }

    const ratingNum = parseInt(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

    // ── Verify order exists, belongs to user, and is delivered ──
    const order = await prisma.laundryRequest.findUnique({ where: { id: orderId } });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only review your own orders.' });
    }
    if (order.status !== 'delivered') {
      return res.status(400).json({ error: 'You can only review orders that have been delivered.' });
    }

    // ── Verify provider exists ──
    const provider = await prisma.user.findFirst({
      where: { id: providerId, userType: 'provider' },
    });
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found.' });
    }

    // ── Enforce one review per order ──
    const existingReview = await prisma.review.findUnique({ where: { orderId } });
    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this order.' });
    }

    // ── Create the review ──
    const review = await prisma.review.create({
      data: {
        orderId,
        userId: req.user.id,
        providerId,
        rating: ratingNum,
        comment: comment ? comment.trim() : null,
      },
    });

    // ── Recalculate provider's average rating ──
    const stats = await prisma.review.aggregate({
      where: { providerId },
      _avg: { rating: true },
      _count: true,
    });

    await prisma.user.update({
      where: { id: providerId },
      data: {
        avgRating: Math.round((stats._avg.rating || 0) * 100) / 100,
        reviewCount: stats._count,
      },
    });

    // ── Notify the provider ──
    const stars = '★'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum);
    await sendNotification(
      providerId,
      'New Review Received',
      `${req.user.firstName} rated you ${stars} for order #${order.requestNumber}${comment ? ': "' + comment.trim() + '"' : ''}`,
      'info',
      { orderId }
    );

    // Log audit event
    await logReviewSubmitted(review, req.user.id, req);

    res.status(201).json({
      message: 'Review submitted successfully!',
      review,
      providerRating: {
        avgRating: stats._avg.rating,
        reviewCount: stats._count,
      },
    });
  } catch (error) {
    console.error('Review creation error:', error);
    res.status(500).json({ error: 'Failed to submit review.' });
  }
});

// ============================================================
// GET /api/reviews/provider/:id — Reviews for a provider
// ============================================================
router.get('/provider/:id', authenticate, async (req, res) => {
  try {
    const providerId = parseInt(req.params.id);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;
    const offset = (page - 1) * limit;

    const [reviews, totalRecords, stats] = await Promise.all([
      prisma.review.findMany({
        where: { providerId },
        include: {
          user: { select: { firstName: true, lastName: true } },
          order: { select: { requestNumber: true, laundryType: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.review.count({ where: { providerId } }),
      prisma.review.aggregate({
        where: { providerId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    // Rating distribution
    const distribution = await prisma.review.groupBy({
      by: ['rating'],
      where: { providerId },
      _count: true,
      orderBy: { rating: 'desc' },
    });

    res.json({
      reviews,
      avgRating: Math.round((stats._avg.rating || 0) * 100) / 100,
      reviewCount: stats._count,
      distribution: distribution.map((d) => ({ rating: d.rating, count: d._count })),
      pagination: { page, limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) },
    });
  } catch (error) {
    console.error('Provider reviews error:', error);
    res.status(500).json({ error: 'Failed to load reviews.' });
  }
});

// ============================================================
// GET /api/reviews/order/:id — Check if an order has a review
// ============================================================
router.get('/order/:id', authenticate, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const review = await prisma.review.findUnique({
      where: { orderId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    res.json({ review: review || null, hasReview: !!review });
  } catch (error) {
    console.error('Order review check error:', error);
    res.status(500).json({ error: 'Failed to check review.' });
  }
});

module.exports = router;
