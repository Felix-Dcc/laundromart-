const express = require('express');
const config = require('../config');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

router.use(authenticate);

// GET /api/notifications - List notifications (mirrors notifications.php)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = config.app.recordsPerPage;
    const offset = (page - 1) * limit;
    const { type, read } = req.query;

    const where = { userId: req.user.id };

    if (type) {
      where.type = type;
    }

    if (read === 'read') {
      where.isRead = true;
    } else if (read === 'unread') {
      where.isRead = false;
    }

    const [notifications, totalRecords, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: req.user.id, isRead: false },
      }),
    ]);

    res.json({
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

// GET /api/notifications/unread-count - Unread count
router.get('/unread-count', async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false },
    });
    res.json({ count });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count.' });
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: req.user.id },
      data: { isRead: true },
    });
    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
});

// PUT /api/notifications/read-all - Mark all as read
router.put('/read-all', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
});

const PREF_FIELDS = ['orderUpdates', 'promotions', 'messages', 'providerUpdates', 'system'];
const PREF_DEFAULTS = { orderUpdates: true, promotions: true, messages: true, providerUpdates: true, system: true };

// GET /api/notifications/preferences - push category toggles
router.get('/preferences', async (req, res) => {
  try {
    const pref = await prisma.notificationPreference.findUnique({ where: { userId: req.user.id } });
    const out = { ...PREF_DEFAULTS };
    if (pref) PREF_FIELDS.forEach((f) => { out[f] = pref[f]; });
    res.json({ preferences: out });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to load preferences.' });
  }
});

// PUT /api/notifications/preferences - update category toggles
router.put('/preferences', async (req, res) => {
  try {
    const patch = {};
    PREF_FIELDS.forEach((f) => { if (typeof req.body[f] === 'boolean') patch[f] = req.body[f]; });
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid preference fields provided.' });
    }
    const pref = await prisma.notificationPreference.upsert({
      where: { userId: req.user.id },
      update: patch,
      create: { userId: req.user.id, ...PREF_DEFAULTS, ...patch },
    });
    const out = {};
    PREF_FIELDS.forEach((f) => { out[f] = pref[f]; });
    res.json({ message: 'Preferences updated.', preferences: out });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences.' });
  }
});

module.exports = router;
