/**
 * Centralized rider GPS tracking.
 *
 * Lives outside the screens (driven by RiderContext) so tracking SURVIVES
 * screen changes and keeps running until the order is delivered to the
 * laundromat. One watcher, one socket emit path — no duplicate emissions.
 *
 * Pipeline: high-accuracy GPS → filter (accuracy / dedupe / jump) →
 * emit on (moved >5m OR >3s) → throttled HTTP persist. Re-emits the latest
 * fix immediately on socket reconnect.
 */
import * as Location from 'expo-location';
import { emitRiderLocation as socketEmitRiderLocation, connectSocket } from './realtime';
import { riderAPI } from '../api/client';

// ── Tunables ──
const ACCURACY_REJECT_M = 25;   // ignore fixes worse than this
const MIN_MOVE_M = 5;           // emit if moved at least this far …
const MIN_TIME_MS = 3000;       // … OR this much time passed
const HTTP_PERSIST_MS = 4000;   // DB persist throttle
const MAX_SPEED_MPS = 60;       // ~216 km/h → above = GPS jump, reject
const DEDUPE_M = 1;             // treat sub-meter moves as duplicates

// ── Module state ──
let watcher = null;
let currentOrderIds = [];   // all active order ids to broadcast to (multi-task)
let currentRiderId = null;
let lastEmit = null;   // { latitude, longitude, t } last coordinate we emitted
let lastAccepted = null; // { latitude, longitude, t } last accepted fix (jump filter)
let lastHttp = 0;
let latest = null;     // latest accepted fix exposed to subscribers
let reconnectHooked = false;
const subscribers = new Set();

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function notify() {
  subscribers.forEach((cb) => { try { cb(latest); } catch (e) { /* ignore */ } });
}

/** Subscribe to accepted rider fixes. Returns an unsubscribe fn. */
export function subscribeRiderTracking(cb) {
  subscribers.add(cb);
  if (latest) cb(latest);
  return () => subscribers.delete(cb);
}

export function getLatestRiderLocation() {
  return latest;
}

export function isTrackingOrder(orderId) {
  return !!watcher && currentOrderIds.includes(orderId);
}

// Update the set of active orders we broadcast the rider's location to, without
// restarting the GPS watcher.
function setTrackedOrders(orders, riderId) {
  currentOrderIds = (orders || []).map((o) => (typeof o === 'object' ? o.id : o)).filter(Boolean);
  if (riderId != null) currentRiderId = riderId;
}

/**
 * Start (or update) tracking for a rider's active tasks.
 * @param {Array} orders  array of order objects (or ids) the rider is carrying
 * @param {number} riderId  the rider's user id (used in the emit payload)
 */
export async function startRiderTracking(orders, riderId) {
  setTrackedOrders(orders, riderId);
  if (currentOrderIds.length === 0) return;
  if (watcher) return; // already running — order set was updated above

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[riderTracking] foreground location not granted');
    return;
  }
  try { await Location.requestBackgroundPermissionsAsync(); } catch (e) { /* ignore */ }

  await connectSocket();
  hookReconnect();

  try {
    watcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 2500,
        distanceInterval: 8,
        mayShowUserSettingsDialog: true,
      },
      onReading,
    );
    console.log(`[riderTracking] started for ${currentOrderIds.length} task(s)`);
  } catch (e) {
    console.error('[riderTracking] watchPosition error:', e);
  }
}

export { setTrackedOrders as updateTrackedOrders };

/**
 * Add a single order to the broadcast set (e.g. a return delivery) without
 * disturbing the rider's existing pickup tasks. Starts the GPS watcher if it
 * isn't already running.
 */
export async function addTrackedOrder(orderId, riderId) {
  if (!orderId) return;
  if (!currentOrderIds.includes(orderId)) currentOrderIds.push(orderId);
  if (riderId != null) currentRiderId = riderId;
  if (!watcher) await startRiderTracking(currentOrderIds.slice(), currentRiderId);
}

/** Stop broadcasting to a single order (does not stop the watcher). */
export function removeTrackedOrder(orderId) {
  currentOrderIds = currentOrderIds.filter((id) => id !== orderId);
}

function onReading(loc) {
  if (!loc?.coords) return;
  const { latitude, longitude, accuracy, heading, speed } = loc.coords;
  const t = loc.timestamp || Date.now();

  // ── Filter 1: reject inaccurate fixes ──
  if (accuracy != null && accuracy > ACCURACY_REJECT_M) return;

  // ── Filter 2: reject impossible jumps & duplicates ──
  if (lastAccepted) {
    const d = haversineM(lastAccepted, { latitude, longitude });
    const dt = Math.max(0.5, (t - lastAccepted.t) / 1000);
    const v = d / dt;
    if (v > MAX_SPEED_MPS && d > 50) return; // teleport / noise spike
  }

  latest = {
    latitude,
    longitude,
    heading: heading != null && heading >= 0 ? heading : (latest?.heading ?? null),
    speed: speed != null && speed >= 0 ? speed : 0,
    accuracy: accuracy ?? null,
    t,
  };
  lastAccepted = { latitude, longitude, t };
  notify();

  maybeEmit(latitude, longitude, latest.heading, latest.speed, t);
  maybePersist(latitude, longitude);
}

function maybeEmit(latitude, longitude, heading, speed, t) {
  if (currentOrderIds.length === 0) return;
  if (lastEmit) {
    const d = haversineM(lastEmit, { latitude, longitude });
    const dt = t - lastEmit.t;
    if (d < DEDUPE_M && dt < MIN_TIME_MS) return;       // duplicate & recent
    if (d < MIN_MOVE_M && dt < MIN_TIME_MS) return;     // not enough change yet
  }
  // Broadcast to EVERY active order's room so each customer tracks the rider.
  currentOrderIds.forEach((orderId) => {
    socketEmitRiderLocation({
      orderId,
      riderId: currentRiderId,
      latitude,
      longitude,
      heading: heading ?? null,
      speed: speed ?? null,
    });
  });
  lastEmit = { latitude, longitude, t };
}

function maybePersist(latitude, longitude) {
  const now = Date.now();
  if (now - lastHttp < HTTP_PERSIST_MS) return;
  lastHttp = now;
  riderAPI.updateLocation(latitude, longitude).catch(() => {});
}

function hookReconnect() {
  if (reconnectHooked) return;
  reconnectHooked = true;
  connectSocket().then((socket) => {
    // On reconnect, immediately push the latest known fix so the user never
    // sees a stale position after a dropped connection.
    socket.io.on('reconnect', () => {
      if (latest && currentOrderIds.length) {
        currentOrderIds.forEach((orderId) => {
          socketEmitRiderLocation({
            orderId,
            riderId: currentRiderId,
            latitude: latest.latitude,
            longitude: latest.longitude,
            heading: latest.heading,
            speed: latest.speed,
          });
        });
      }
    });
  });
}

export async function stopRiderTracking({ silent = false } = {}) {
  if (watcher) {
    watcher.remove();
    watcher = null;
  }
  currentOrderIds = [];
  currentRiderId = null;
  lastEmit = null;
  lastAccepted = null;
  latest = null;
  if (!silent) notify();
}
