const express = require('express');
const config = require('../config');
const prisma = require('../lib/prisma');
const { authenticate, requireUser, requireAdmin } = require('../middleware/auth');
const { sendNotification } = require('../services/notification');
const { ORDER_INCLUDE } = require('../lib/orderShape');
const {
  initializeCharge, verifyCharge, refundCharge,
  verifyWebhookSignature, generateReference, toSubunit, isLive,
} = require('../services/payment');

// The amount the customer owes: (verified final amount, else estimate) minus
// any promo discount, floored at zero.
function amountDueOf(order) {
  const base = order.finalAmount != null ? Number(order.finalAmount) : Number(order.totalAmount);
  return Math.max(0, Math.round((base - Number(order.promoDiscount || 0)) * 100) / 100);
}

const router = express.Router();

const VALID_METHODS = ['momo', 'card'];
const VALID_MOMO = ['mtn', 'vodafone', 'airteltigo'];

function buildReceipt(txn, order) {
  return {
    receiptNumber: `RCPT-${txn.reference}`,
    reference: txn.reference,
    orderNumber: order?.requestNumber,
    amount: Number(txn.amount),
    currency: txn.currency,
    method: txn.method,
    channel: txn.channel,
    status: txn.status,
    paidAt: txn.paidAt,
  };
}

/**
 * Idempotently transition a pending transaction → paid, update the order, log,
 * and notify. Safe to call from both /verify and the webhook (only the first
 * call has effect). Includes an amount fraud-check in live mode.
 */
async function markTransactionPaid(txn, gatewayData) {
  if (txn.status === 'paid') return txn; // already settled — idempotent

  const order = await prisma.laundryRequest.findUnique({ where: { id: txn.orderId } });

  // Fraud prevention: the amount the gateway actually charged must match the
  // amount due (final if verified, else estimate). Live mode only.
  if (isLive() && gatewayData && gatewayData.amount != null && order) {
    const expected = toSubunit(amountDueOf(order));
    if (Number(gatewayData.amount) < expected) {
      await prisma.transaction.update({
        where: { id: txn.id },
        data: { status: 'failed', failureReason: `Amount mismatch: charged ${gatewayData.amount}, expected ${expected}` },
      });
      throw new Error('Payment amount does not match the order total.');
    }
  }

  const channelFromGateway = gatewayData?.channel === 'mobile_money'
    ? txn.channel
    : (gatewayData?.channel === 'card' ? 'card' : txn.channel);

  const [updatedTxn] = await prisma.$transaction([
    prisma.transaction.update({
      where: { id: txn.id },
      data: {
        status: 'paid',
        paidAt: new Date(),
        channel: channelFromGateway || txn.channel,
        gatewayReference: gatewayData?.reference || txn.gatewayReference || txn.reference,
        metadata: gatewayData ? JSON.stringify(gatewayData).slice(0, 8000) : txn.metadata,
      },
    }),
    prisma.laundryRequest.update({
      where: { id: txn.orderId },
      data: { paymentStatus: 'paid', paymentMethod: txn.method },
    }),
  ]);

  // Audit trail
  await prisma.auditLog.create({
    data: {
      userId: txn.userId,
      actionType: 'PAYMENT_PROCESSED',
      entityType: 'transaction',
      entityId: txn.id,
      description: `Payment ${txn.reference} marked paid for order ${order?.requestNumber}`,
    },
  }).catch(() => {});

  await sendNotification(
    txn.userId,
    'Payment Successful',
    `Your payment of ${txn.currency} ${Number(txn.amount).toFixed(2)} for order #${order?.requestNumber} was successful.`,
    'success',
    { orderId: txn.orderId, screen: 'RequestDetails' },
  ).catch(() => {});

  // ── Timeline "Payment Confirmed" + live sync to every role ──
  // Payment is orthogonal to order status (paymentStatus), so we record a
  // timeline marker rather than a status transition, then re-broadcast the
  // order so the provider dashboard + customer timeline update with no refresh.
  try {
    await prisma.requestStatusHistory.create({
      data: {
        requestId: txn.orderId,
        status: 'payment_confirmed',
        notes: `Payment of ${txn.currency} ${Number(txn.amount).toFixed(2)} received.`,
        changedBy: txn.userId,
      },
    });
    const fresh = await prisma.laundryRequest.findUnique({ where: { id: txn.orderId }, include: ORDER_INCLUDE });
    if (fresh) {
      // Burn one promo-code use now that the order is actually paid.
      if (fresh.promoCode) await require('../services/promo').markUsed(fresh.promoCode);
      require('../services/realtime').emitOrderTransition(fresh, { from: fresh.status, to: fresh.status });
      // Let the laundromat know they can start washing.
      if (fresh.providerId) {
        await sendNotification(
          fresh.providerId,
          'Payment Confirmed',
          `Payment received for order #${fresh.requestNumber}. You can now begin washing.`,
          'success',
          { orderId: fresh.id, screen: 'OrderDetails' },
        ).catch(() => {});
      }
    }
  } catch (e) { console.error('Payment-confirmed sync error:', e.message); }

  return updatedTxn;
}

// ============================================================
// POST /api/payments/initialize — start a payment for an order
// Body: { orderId, method: 'momo'|'card', channel?, idempotencyKey? }
// ============================================================
router.post('/initialize', authenticate, requireUser, async (req, res) => {
  try {
    const { orderId, method, channel, idempotencyKey, callbackUrl } = req.body;

    if (!orderId) return res.status(400).json({ error: 'orderId is required.' });
    if (!VALID_METHODS.includes(method)) {
      return res.status(400).json({ error: "method must be 'momo' or 'card'." });
    }
    if (method === 'momo' && !VALID_MOMO.includes(channel)) {
      return res.status(400).json({ error: `For momo, channel must be one of: ${VALID_MOMO.join(', ')}.` });
    }

    const order = await prisma.laundryRequest.findFirst({
      where: { id: parseInt(orderId), userId: req.user.id },
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Prevent duplicate payments.
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'This order has already been paid.' });
    }
    // No charge until the laundromat has verified the actual weight & final price.
    if (order.finalAmount == null) {
      return res.status(409).json({ error: 'Payment opens once the laundromat verifies your laundry weight and confirms the final amount.' });
    }
    const alreadyPaid = await prisma.transaction.findFirst({
      where: { orderId: order.id, status: 'paid' },
    });
    if (alreadyPaid) {
      return res.status(400).json({ error: 'This order has already been paid.' });
    }

    // Idempotency: replay the same request safely.
    if (idempotencyKey) {
      const existing = await prisma.transaction.findUnique({ where: { idempotencyKey } });
      if (existing) {
        return res.json({
          reference: existing.reference,
          authorizationUrl: existing.authorizationUrl,
          transaction: existing,
          reused: true,
        });
      }
    }

    // Reuse an in-flight pending transaction for this order rather than stacking new ones.
    const pending = await prisma.transaction.findFirst({
      where: { orderId: order.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (pending && pending.authorizationUrl) {
      return res.json({
        reference: pending.reference,
        authorizationUrl: pending.authorizationUrl,
        transaction: pending,
        reused: true,
      });
    }

    const amountDue = amountDueOf(order);
    const reference = generateReference(order.id);
    const initData = await initializeCharge({
      email: req.user.email,
      amount: amountDue,
      reference,
      method,
      channel,
      callbackUrl,
      metadata: { orderId: order.id, userId: req.user.id, requestNumber: order.requestNumber },
    });

    const txn = await prisma.transaction.create({
      data: {
        reference,
        orderId: order.id,
        userId: req.user.id,
        provider: 'paystack',
        method,
        channel: method === 'card' ? 'card' : channel,
        amount: amountDue,
        currency: config.payments.currency,
        status: 'pending',
        idempotencyKey: idempotencyKey || null,
        authorizationUrl: initData.authorization_url || null,
        gatewayReference: initData.reference || reference,
      },
    });

    res.status(201).json({
      reference,
      authorizationUrl: initData.authorization_url,
      stub: !!initData.stub,
      transaction: txn,
    });
  } catch (error) {
    console.error('Payment initialize error:', error.message);
    res.status(500).json({ error: 'Failed to initialize payment.' });
  }
});

// ============================================================
// GET /api/payments/verify/:reference — confirm a payment
// ============================================================
router.get('/verify/:reference', authenticate, async (req, res) => {
  try {
    const txn = await prisma.transaction.findUnique({ where: { reference: req.params.reference } });
    if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
    if (txn.userId !== req.user.id && req.user.userType !== 'admin') {
      return res.status(403).json({ error: 'Not allowed.' });
    }

    const order = await prisma.laundryRequest.findUnique({ where: { id: txn.orderId } });

    if (txn.status === 'paid') {
      return res.json({ status: 'paid', transaction: txn, receipt: buildReceipt(txn, order) });
    }

    const data = await verifyCharge(txn.reference);
    if (data.status === 'success') {
      const updated = await markTransactionPaid(txn, data);
      return res.json({ status: 'paid', transaction: updated, receipt: buildReceipt(updated, order) });
    }
    if (data.status === 'failed' || data.status === 'abandoned') {
      await prisma.transaction.update({
        where: { id: txn.id },
        data: { status: 'failed', failureReason: data.gateway_response || data.status },
      });
      return res.json({ status: 'failed', transaction: { ...txn, status: 'failed' } });
    }
    res.json({ status: 'pending', transaction: txn });
  } catch (error) {
    console.error('Payment verify error:', error.message);
    res.status(500).json({ error: 'Failed to verify payment.' });
  }
});

// ============================================================
// POST /api/payments/webhook — Paystack webhook (NO auth; signature verified)
// ============================================================
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    if (!verifyWebhookSignature(req.rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature.' });
    }

    const event = req.body;
    const reference = event?.data?.reference;
    if (reference) {
      const txn = await prisma.transaction.findUnique({ where: { reference } });
      if (txn) {
        if (event.event === 'charge.success') {
          await markTransactionPaid(txn, event.data).catch((e) => console.error('webhook markPaid:', e.message));
        } else if (event.event === 'charge.failed') {
          if (txn.status === 'pending') {
            await prisma.transaction.update({
              where: { id: txn.id },
              data: { status: 'failed', failureReason: event.data?.gateway_response || 'charge.failed' },
            });
          }
        }
      }
    }
    // Always 200 quickly so Paystack doesn't retry storm.
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.sendStatus(200);
  }
});

// ============================================================
// GET /api/payments — transaction history (own; admin sees all)
// ============================================================
router.get('/', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = config.app.recordsPerPage;
    const isAdmin = req.user.userType === 'admin' || req.user.userType === 'superadmin';
    const where = isAdmin ? {} : { userId: req.user.id };
    if (req.query.status) where.status = req.query.status;

    const [transactions, totalRecords] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { order: { select: { requestNumber: true } }, user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, pagination: { page, limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) } });
  } catch (error) {
    console.error('Transactions list error:', error.message);
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

// ============================================================
// POST /api/payments/refund/:reference — admin refund
// ============================================================
router.post('/refund/:reference', authenticate, requireAdmin, async (req, res) => {
  try {
    const txn = await prisma.transaction.findUnique({ where: { reference: req.params.reference } });
    if (!txn) return res.status(404).json({ error: 'Transaction not found.' });
    if (txn.status !== 'paid') {
      return res.status(400).json({ error: 'Only paid transactions can be refunded.' });
    }

    await refundCharge(txn.gatewayReference || txn.reference, Number(txn.amount));

    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: txn.id },
        data: { status: 'refunded', refundedAt: new Date() },
      }),
      prisma.laundryRequest.update({
        where: { id: txn.orderId },
        data: { paymentStatus: 'refunded' },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: 'REFUND_ISSUED',
        entityType: 'transaction',
        entityId: txn.id,
        description: `Refund issued for ${txn.reference} (${txn.currency} ${Number(txn.amount).toFixed(2)})`,
      },
    }).catch(() => {});

    await sendNotification(
      txn.userId,
      'Payment Refunded',
      `Your payment of ${txn.currency} ${Number(txn.amount).toFixed(2)} has been refunded.`,
      'info',
      { orderId: txn.orderId, screen: 'RequestDetails' },
    ).catch(() => {});

    res.json({ message: 'Refund issued successfully.', reference: txn.reference });
  } catch (error) {
    console.error('Refund error:', error.message);
    res.status(500).json({ error: 'Failed to issue refund.' });
  }
});

module.exports = router;
