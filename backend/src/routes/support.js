const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendNotification } = require('../services/notification');

const router = express.Router();
const prisma = require('../lib/prisma');

router.use(authenticate);

const isAdmin = (u) => u.userType === 'admin' || u.userType === 'superadmin';

// GET /api/support/tickets — admins see all, users see their own
router.get('/tickets', async (req, res) => {
  try {
    const where = isAdmin(req.user) ? {} : { userId: req.user.id };
    if (req.query.status) where.status = req.query.status;
    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true, userType: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' }, take: 200,
    });
    res.json({
      tickets: tickets.map((t) => ({
        id: t.id, subject: t.subject, status: t.status,
        user: t.user ? `${t.user.firstName} ${t.user.lastName}` : 'Unknown',
        email: t.user?.email, role: t.user?.userType,
        lastMessage: t.messages[0]?.body || null, messageCount: t._count.messages,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Tickets list error:', error);
    res.status(500).json({ error: 'Failed to load tickets.' });
  }
});

// GET /api/support/tickets/:id — full conversation
router.get('/tickets/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const t = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        messages: { include: { sender: { select: { firstName: true, lastName: true, userType: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    if (!isAdmin(req.user) && t.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized.' });
    res.json({
      ticket: {
        id: t.id, subject: t.subject, status: t.status,
        user: `${t.user.firstName} ${t.user.lastName}`, email: t.user.email, userId: t.user.id,
        messages: t.messages.map((m) => ({
          id: m.id, body: m.body, at: m.createdAt,
          from: `${m.sender.firstName} ${m.sender.lastName}`,
          role: m.sender.userType, isStaff: m.sender.userType === 'admin' || m.sender.userType === 'superadmin',
        })),
      },
    });
  } catch (error) {
    console.error('Ticket details error:', error);
    res.status(500).json({ error: 'Failed to load ticket.' });
  }
});

// POST /api/support/tickets — open a ticket (user for self; admin may log for a user)
router.post('/tickets', async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject?.trim() || !message?.trim()) return res.status(400).json({ error: 'Subject and message are required.' });
    let ownerId = req.user.id;
    if (isAdmin(req.user) && req.body.userId) {
      const u = await prisma.user.findUnique({ where: { id: parseInt(req.body.userId) } });
      if (!u) return res.status(400).json({ error: 'Selected user not found.' });
      ownerId = u.id;
    }
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: ownerId, subject: subject.trim(),
        messages: { create: { senderId: req.user.id, body: message.trim() } },
      },
    });
    if (ownerId !== req.user.id) {
      await sendNotification(ownerId, 'Support Ticket Opened', `A support ticket "${subject.trim()}" was opened for you.`, 'info', { category: 'system' });
    }
    res.status(201).json({ message: 'Ticket created.', id: ticket.id });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Failed to create ticket.' });
  }
});

// POST /api/support/tickets/:id/reply
router.post('/tickets/:id/reply', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = (req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
    const t = await prisma.supportTicket.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    const staff = isAdmin(req.user);
    if (!staff && t.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized.' });

    await prisma.ticketMessage.create({ data: { ticketId: id, senderId: req.user.id, body } });
    // Staff reply → awaiting customer; customer reply → back to open.
    await prisma.supportTicket.update({ where: { id }, data: { status: staff ? 'pending' : 'open' } });
    if (staff) {
      await sendNotification(t.userId, 'Support Replied', `Support replied to your ticket "${t.subject}".`, 'info', { category: 'system' });
    }
    res.json({ message: 'Reply sent.' });
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ error: 'Failed to send reply.' });
  }
});

// PATCH /api/support/tickets/:id — status (admin)
router.patch('/tickets/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const status = req.body.status;
    if (!['open', 'pending', 'resolved', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const t = await prisma.supportTicket.update({ where: { id }, data: { status } });
    if (status === 'resolved') await sendNotification(t.userId, 'Ticket Resolved', `Your support ticket "${t.subject}" was marked resolved.`, 'success', { category: 'system' });
    res.json({ message: 'Ticket updated.' });
  } catch (error) {
    console.error('Ticket status error:', error);
    res.status(500).json({ error: 'Failed to update ticket.' });
  }
});

module.exports = router;
