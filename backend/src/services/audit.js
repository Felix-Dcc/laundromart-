
const prisma = require('../lib/prisma');

// ============================================================
// AUDIT LOGGING SERVICE
//
// Immutable audit trail for all critical actions.
// Logs are NEVER updated or deleted — append-only.
// ============================================================

/**
 * Log an audit event
 *
 * @param {Object} params
 * @param {number} params.userId - ID of user performing the action
 * @param {string} params.actionType - AuditActionType enum value
 * @param {string} params.entityType - 'order', 'user', 'pricing', etc.
 * @param {number|null} params.entityId - ID of affected entity (if applicable)
 * @param {string} params.description - Human-readable description
 * @param {Object|null} params.metadata - Additional context (will be JSON stringified)
 * @param {string|null} params.ipAddress - IP address of requester
 * @param {string|null} params.userAgent - User agent string
 */
async function logAuditEvent({
  userId,
  actionType,
  entityType,
  entityId = null,
  description,
  metadata = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        actionType,
        entityType,
        entityId,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    // Audit logging should NEVER break the main flow
    // Log to console but don't throw
    console.error('Audit log error (non-blocking):', error.message);
  }
}

/**
 * Log order status change
 */
async function logOrderStatusChange(order, oldStatus, newStatus, changedBy, req = null) {
  const user = await prisma.user.findUnique({ where: { id: changedBy } });
  const userName = user ? `${user.firstName} ${user.lastName}` : `User #${changedBy}`;

  await logAuditEvent({
    userId: changedBy,
    actionType: 'ORDER_STATUS_CHANGED',
    entityType: 'order',
    entityId: order.id,
    description: `${userName} changed order #${order.requestNumber} status from "${oldStatus}" to "${newStatus}"`,
    metadata: {
      orderId: order.id,
      requestNumber: order.requestNumber,
      oldStatus,
      newStatus,
      customerId: order.userId,
    },
    ipAddress: req?.ip || req?.connection?.remoteAddress || null,
    userAgent: req?.get?.('user-agent') || null,
  });
}

/**
 * Log order creation
 */
async function logOrderCreated(order, createdBy, req = null) {
  const user = await prisma.user.findUnique({ where: { id: createdBy } });
  const userName = user ? `${user.firstName} ${user.lastName}` : `User #${createdBy}`;

  await logAuditEvent({
    userId: createdBy,
    actionType: 'ORDER_CREATED',
    entityType: 'order',
    entityId: order.id,
    description: `${userName} created order #${order.requestNumber}`,
    metadata: {
      orderId: order.id,
      requestNumber: order.requestNumber,
      customerId: order.userId,
      totalAmount: order.totalAmount.toString(),
      status: order.status,
    },
    ipAddress: req?.ip || req?.connection?.remoteAddress || null,
    userAgent: req?.get?.('user-agent') || null,
  });
}

/**
 * Log order cancellation
 */
async function logOrderCancelled(order, cancelledBy, reason = null, req = null) {
  const user = await prisma.user.findUnique({ where: { id: cancelledBy } });
  const userName = user ? `${user.firstName} ${user.lastName}` : `User #${cancelledBy}`;

  await logAuditEvent({
    userId: cancelledBy,
    actionType: 'ORDER_CANCELLED',
    entityType: 'order',
    entityId: order.id,
    description: `${userName} cancelled order #${order.requestNumber}${reason ? `: ${reason}` : ''}`,
    metadata: {
      orderId: order.id,
      requestNumber: order.requestNumber,
      customerId: order.userId,
      reason,
      previousStatus: order.status,
    },
    ipAddress: req?.ip || req?.connection?.remoteAddress || null,
    userAgent: req?.get?.('user-agent') || null,
  });
}

/**
 * Log user status change (admin action)
 */
async function logUserStatusChange(targetUser, oldStatus, newStatus, changedBy, req = null) {
  const admin = await prisma.user.findUnique({ where: { id: changedBy } });
  const adminName = admin ? `${admin.firstName} ${admin.lastName}` : `Admin #${changedBy}`;
  const targetName = `${targetUser.firstName} ${targetUser.lastName}`;

  await logAuditEvent({
    userId: changedBy,
    actionType: 'USER_STATUS_CHANGED',
    entityType: 'user',
    entityId: targetUser.id,
    description: `${adminName} changed ${targetName}'s status from "${oldStatus}" to "${newStatus}"`,
    metadata: {
      targetUserId: targetUser.id,
      targetUserEmail: targetUser.email,
      oldStatus,
      newStatus,
    },
    ipAddress: req?.ip || req?.connection?.remoteAddress || null,
    userAgent: req?.get?.('user-agent') || null,
  });
}

/**
 * Log pricing update
 */
async function logPricingUpdate(pricing, updatedBy, req = null) {
  const user = await prisma.user.findUnique({ where: { id: updatedBy } });
  const userName = user ? `${user.firstName} ${user.lastName}` : `User #${updatedBy}`;

  await logAuditEvent({
    userId: updatedBy,
    actionType: 'PRICING_UPDATED',
    entityType: 'pricing',
    entityId: pricing.id,
    description: `${userName} updated pricing for "${pricing.serviceType}"`,
    metadata: {
      pricingId: pricing.id,
      serviceType: pricing.serviceType,
      newPrice: pricing.pricePerKg.toString(),
    },
    ipAddress: req?.ip || req?.connection?.remoteAddress || null,
    userAgent: req?.get?.('user-agent') || null,
  });
}

/**
 * Log review submission
 */
async function logReviewSubmitted(review, submittedBy, req = null) {
  const user = await prisma.user.findUnique({ where: { id: submittedBy } });
  const userName = user ? `${user.firstName} ${user.lastName}` : `User #${submittedBy}`;

  await logAuditEvent({
    userId: submittedBy,
    actionType: 'REVIEW_SUBMITTED',
    entityType: 'order',
    entityId: review.orderId,
    description: `${userName} submitted a ${review.rating}-star review for order #${review.orderId}`,
    metadata: {
      reviewId: review.id,
      orderId: review.orderId,
      providerId: review.providerId,
      rating: review.rating,
    },
    ipAddress: req?.ip || req?.connection?.remoteAddress || null,
    userAgent: req?.get?.('user-agent') || null,
  });
}

module.exports = {
  logAuditEvent,
  logOrderStatusChange,
  logOrderCreated,
  logOrderCancelled,
  logUserStatusChange,
  logPricingUpdate,
  logReviewSubmitted,
};
