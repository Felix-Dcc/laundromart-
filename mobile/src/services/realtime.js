/**
 * Real-Time Socket.IO Client Service
 */

import { io } from 'socket.io-client';
import { API_BASE_URL } from '../api/client';
import * as SecureStore from '../utils/storage';

let socket = null;
let isConnected = false;
let connectPromise = null;
const pendingEmits = [];

function getBaseURL() {
  return API_BASE_URL ? API_BASE_URL.replace('/api', '') : 'http://localhost:3000';
}

/**
 * Connect to the Socket.IO server.
 * Returns a promise that resolves with the socket once connected.
 * Safe to call multiple times -- reuses the existing connection.
 */
export function connectSocket() {
  // Already connected
  if (socket && isConnected) return Promise.resolve(socket);

  // Connection in progress
  if (connectPromise) return connectPromise;

  connectPromise = new Promise((resolve) => {
    // Tear down stale socket if it exists but isn't connected
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    const baseURL = getBaseURL();
    console.log('[REALTIME] Connecting to:', baseURL);

    socket = io(baseURL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
      // Send the current JWT on every (re)connect so the server can authorize
      // this socket. The function form re-reads the token after a refresh.
      auth: (cb) => {
        SecureStore.getItemAsync('authToken')
          .then((token) => cb({ token: token || '' }))
          .catch(() => cb({ token: '' }));
      },
    });

    socket.on('connect', () => {
      isConnected = true;
      connectPromise = null;
      console.log('[REALTIME] Connected:', socket.id);

      // Flush any queued emits
      while (pendingEmits.length > 0) {
        const { event, data } = pendingEmits.shift();
        socket.emit(event, data);
        console.log('[REALTIME] Flushed queued emit:', event);
      }

      resolve(socket);
    });

    socket.on('disconnect', (reason) => {
      isConnected = false;
      connectPromise = null;
      console.log('[REALTIME] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      isConnected = false;
      console.error('[REALTIME] Connection error:', err.message);
    });

    socket.io.on('reconnect', () => {
      isConnected = true;
      console.log('[REALTIME] Reconnected:', socket.id);
    });
  });

  return connectPromise;
}

/**
 * Emit safely -- queues the event if socket is not yet connected.
 */
function safeEmit(event, data) {
  if (socket && isConnected) {
    socket.emit(event, data);
  } else {
    console.log('[REALTIME] Queueing emit until connected:', event);
    pendingEmits.push({ event, data });
    connectSocket();
  }
}

/**
 * Subscribe to order status updates (pickup status, service status, etc.)
 */
export function subscribeToOrder(orderId, callback) {
  connectSocket().then(() => {
    socket.emit('subscribe_order', orderId);
    console.log(`[REALTIME] Joined order room: order:${orderId}`);
  });

  const handler = (data) => {
    if (data.orderId === orderId || data.orderId === Number(orderId)) {
      console.log(`[REALTIME] order_update for order:${orderId}`, data.type);
      callback(data);
    }
  };

  // Attach listener immediately (socket object exists even before connect)
  connectSocket().then(() => {
    socket.on('order_update', handler);
  });

  return () => {
    if (socket) {
      socket.off('order_update', handler);
      socket.emit('unsubscribe_order', orderId);
    }
  };
}

/**
 * Subscribe to the role-scoped order feed (dashboards).
 *
 * The server auto-joins each socket to its role rooms on connect
 * (role:admin / provider:{id} / rider:{id} / riders:available), then pushes
 * `order_update` to those rooms on every transition. Dashboards call this to
 * refresh live with NO manual pull. Returns an unsubscribe function.
 */
export function subscribeToOrderFeed(callback) {
  let handler = null;
  let unsubscribed = false;

  connectSocket().then((sock) => {
    if (unsubscribed) return;
    handler = (data) => callback(data);
    sock.on('order_update', handler);
  });

  return () => {
    unsubscribed = true;
    if (socket && handler) socket.off('order_update', handler);
  };
}

/**
 * Subscribe to live rider location updates for an order.
 * Ensures the socket is connected and the order room is joined before listening.
 */
export function subscribeToRiderLocation(orderId, callback) {
  let handler = null;
  let unsubscribed = false;

  connectSocket().then((sock) => {
    if (unsubscribed) return;

    sock.emit('subscribe_order', orderId);
    console.log(`[REALTIME] Rider-location: joined room order:${orderId}`);

    handler = (data) => {
      if (data.orderId === orderId || data.orderId === Number(orderId)) {
        console.log(`[REALTIME] rider_location received: lat=${data.latitude}, lng=${data.longitude}`);
        callback(data);
      }
    };

    sock.on('rider_location', handler);
  });

  return () => {
    unsubscribed = true;
    if (socket && handler) {
      socket.off('rider_location', handler);
      socket.emit('unsubscribe_order', orderId);
      console.log(`[REALTIME] Rider-location: left room order:${orderId}`);
    }
  };
}

/**
 * Emit rider location from the rider app via Socket.IO.
 * Also joins the order room so the server relay works.
 */
export function emitRiderLocation(data) {
  safeEmit('rider_location_update', data);
}

/**
 * Join an order room (used by rider to ensure they're in the room).
 */
export function joinOrderRoom(orderId) {
  safeEmit('subscribe_order', orderId);
  console.log(`[REALTIME] joinOrderRoom: order:${orderId}`);
}

/**
 * Subscribe to laundromat updates (added/updated/deleted providers).
 * Returns an unsubscribe function.
 */
export function subscribeToLaundromatUpdates(callback) {
  let handler = null;
  let unsubscribed = false;

  connectSocket().then((sock) => {
    if (unsubscribed) return;

    handler = (data) => {
      console.log(`[REALTIME] laundromat_update: ${data.action}`, data.provider?.id);
      callback(data);
    };

    sock.on('laundromat_update', handler);
  });

  return () => {
    unsubscribed = true;
    if (socket && handler) {
      socket.off('laundromat_update', handler);
    }
  };
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    isConnected = false;
    connectPromise = null;
    console.log('[REALTIME] Socket disconnected');
  }
}

export function isSocketConnected() {
  return isConnected;
}
