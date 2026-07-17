/**
 * Real-Time Event Emitter Service
 * Emits Socket.IO events for order status changes
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../lib/prisma');

let io = null;

// Last coordinate broadcast per order — used to dedupe identical updates.
const lastBroadcastByOrder = new Map();

// ── Authorization helpers ──
// Who may VIEW an order's live data: the customer, the assigned pickup rider,
// the delivery rider, the order's provider, or an admin/superadmin.
async function canViewOrder(socket, orderId) {
  if (!socket.data.userId) return false;
  if (socket.data.userType === 'admin' || socket.data.userType === 'superadmin') return true;
  const order = await prisma.laundryRequest.findUnique({
    where: { id: Number(orderId) },
    select: { userId: true, assignedRiderId: true, deliveryRiderId: true, providerId: true },
  });
  if (!order) return false;
  const me = socket.data.userId;
  return order.userId === me
    || order.assignedRiderId === me
    || order.deliveryRiderId === me
    || order.providerId === me;
}

// Join the standing role rooms so dashboards update live without polling.
function joinRoleRooms(socket) {
  const { userId, userType } = socket.data;
  if (!userId) return;
  if (userType === 'admin' || userType === 'superadmin') socket.join('role:admin');
  if (userType === 'provider') socket.join(`provider:${userId}`);
  if (userType === 'rider') {
    socket.join(`rider:${userId}`);
    socket.join('riders:available'); // new available pickups/deliveries
  }
}

// Who may PUBLISH location for an order: the pickup rider (assignedRiderId)
// OR the return-delivery rider (deliveryRiderId). Cached per-socket (30s TTL)
// so the ~every-3s emits don't hit the DB each time.
async function isAssignedRider(socket, orderId) {
  if (!socket.data.userId || socket.data.userType !== 'rider') return false;
  socket.data.riderOrders = socket.data.riderOrders || new Map();
  const id = Number(orderId);
  const me = socket.data.userId;
  const cached = socket.data.riderOrders.get(id);
  if (cached && Date.now() - cached.t < 30000) return cached.riderIds.includes(me);
  const order = await prisma.laundryRequest.findUnique({ where: { id }, select: { assignedRiderId: true, deliveryRiderId: true } });
  const riderIds = order ? [order.assignedRiderId, order.deliveryRiderId].filter(Boolean) : [];
  socket.data.riderOrders.set(id, { riderIds, t: Date.now() });
  return riderIds.includes(me);
}

/**
 * Initialize Socket.IO server
 */
function initializeSocketIO(server) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: {
      origin: '*', // In production, restrict to your app's origin
      methods: ['GET', 'POST'],
    },
  });

  // Authenticate the socket handshake (JWT). Unauthenticated sockets may still
  // connect, but cannot subscribe to or publish for any order.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (token) {
        const decoded = jwt.verify(token, config.jwt.secret);
        socket.data.userId = decoded.userId;
        socket.data.userType = decoded.userType;
      }
    } catch (e) { /* leave unauthenticated */ }
    next();
  });

  // Horizontal scaling: when Redis is configured, attach the adapter so rooms
  // and emits are shared across all API instances. No-op without Redis.
  if (config.redisUrl) {
    try {
      const { createAdapter } = require('@socket.io/redis-adapter');
      const Redis = require('ioredis');
      const pubClient = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
      const subClient = pubClient.duplicate();
      // Error handlers are required — without them ioredis 'error' events become
      // unhandled and can crash the process when Redis is unreachable.
      pubClient.on('error', (e) => console.warn('[SOCKET.IO] redis pub error:', e.message));
      subClient.on('error', (e) => console.warn('[SOCKET.IO] redis sub error:', e.message));
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[SOCKET.IO] Redis adapter enabled — multi-instance ready');
    } catch (e) {
      console.warn('[SOCKET.IO] Redis adapter unavailable, using in-memory adapter:', e.message);
    }
  }

  io.on('connection', (socket) => {
    console.log('[SOCKET.IO] Client connected:', socket.id);

    // Auto-join standing role rooms (admin / provider / rider) so their
    // dashboards receive every relevant order update with no manual refresh.
    joinRoleRooms(socket);

    // Join order-specific room — only if authorized to view this order.
    socket.on('subscribe_order', async (orderId) => {
      try {
        if (await canViewOrder(socket, orderId)) {
          socket.join(`order:${orderId}`);
        } else {
          socket.emit('subscribe_error', { orderId, error: 'Not authorized to view this order.' });
        }
      } catch (e) {
        socket.emit('subscribe_error', { orderId, error: 'Subscription failed.' });
      }
    });

    // Leave order room
    socket.on('unsubscribe_order', (orderId) => {
      socket.leave(`order:${orderId}`);
    });

    // Rider emits location directly via socket (low-latency path).
    socket.on('rider_location_update', async (data) => {
      if (!data || !data.orderId || !data.latitude || !data.longitude) {
        return;
      }

      // SECURITY: only the order's assigned rider may publish its location.
      if (!(await isAssignedRider(socket, data.orderId))) {
        return;
      }

      const room = `order:${data.orderId}`;

      // Server-side dedupe: drop coordinates identical to the last broadcast
      // for this order so the user never receives redundant updates.
      const last = lastBroadcastByOrder.get(data.orderId);
      if (last && last.latitude === data.latitude && last.longitude === data.longitude) {
        return;
      }
      lastBroadcastByOrder.set(data.orderId, { latitude: data.latitude, longitude: data.longitude });

      const payload = {
        orderId: data.orderId,
        riderId: data.riderId,
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading != null ? data.heading : null,
        speed: data.speed != null ? data.speed : null,
        timestamp: new Date().toISOString(),
      };

      // socket.to() sends to everyone in the room EXCEPT the sender
      socket.to(room).emit('rider_location', payload);
    });

    socket.on('disconnect', () => {
      console.log('[SOCKET.IO] Client disconnected:', socket.id);
    });
  });

  return io;
}

/**
 * Emit order status update to all clients subscribed to the order
 */
function emitOrderUpdate(orderId, updateData) {
  if (!io) {
    console.warn('[REALTIME] Socket.IO not initialized. Skipping event emission.');
    return;
  }

  const eventData = {
    orderId,
    ...updateData,
    timestamp: new Date().toISOString(),
  };

  // Emit to all clients in the order room
  io.to(`order:${orderId}`).emit('order_update', eventData);
  console.log(`[REALTIME] Emitted order_update for order:${orderId}`, eventData);
}

/**
 * Emit a canonical order status transition to every interested client:
 * the order room (customer + riders + provider) AND the standing role rooms
 * (admin dashboard, that provider's dashboard, the assigned riders, and the
 * available-riders pool when work appears/disappears).
 *
 * `order` is a prisma order loaded with ORDER_INCLUDE.
 */
function emitOrderTransition(order, { from, to } = {}) {
  if (!io || !order) return;
  const { shapeOrder } = require('../lib/orderShape');
  const payload = {
    orderId: order.id,
    type: 'status_change',
    from: from || null,
    to: to || order.status,
    status: order.status,
    order: shapeOrder(order), // role-agnostic; clients derive their own actions
    timestamp: new Date().toISOString(),
  };

  io.to(`order:${order.id}`).emit('order_update', payload);
  io.to('role:admin').emit('order_update', payload);
  if (order.providerId) io.to(`provider:${order.providerId}`).emit('order_update', payload);
  if (order.assignedRiderId) io.to(`rider:${order.assignedRiderId}`).emit('order_update', payload);
  if (order.deliveryRiderId) io.to(`rider:${order.deliveryRiderId}`).emit('order_update', payload);

  // The available-work pool changes when an order becomes/stops being claimable.
  const poolEvents = ['awaiting_rider', 'ready_for_delivery', 'rider_assigned', 'delivery_rider_assigned', 'cancelled'];
  if (poolEvents.includes(payload.to) || poolEvents.includes(payload.from)) {
    io.to('riders:available').emit('order_update', payload);
  }
}

/**
 * Emit rider location update to clients tracking a specific order
 */
function emitRiderLocation(orderId, locationData) {
  if (!io) return;
  io.to(`order:${orderId}`).emit('rider_location', {
    orderId,
    ...locationData,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit laundromat update to all connected clients (for map refresh)
 */
function emitLaundromatUpdate(action, providerData) {
  if (!io) return;
  io.emit('laundromat_update', {
    action,
    provider: providerData,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get Socket.IO instance (for advanced usage)
 */
function getIO() {
  return io;
}

module.exports = {
  initializeSocketIO,
  emitOrderUpdate,
  emitOrderTransition,
  emitRiderLocation,
  emitLaundromatUpdate,
  getIO,
};
