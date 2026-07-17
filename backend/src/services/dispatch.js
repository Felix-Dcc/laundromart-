/**
 * Multi-task rider dispatch helpers.
 *
 * Riders can hold several pickup tasks at once (default 3, admin-configurable).
 * A task is "active" while its status is in the pickup leg (rider_assigned →
 * picked_up, i.e. not yet delivered to the laundromat). The count is computed —
 * never stored — so it can't drift.
 */
const prisma = require('../lib/prisma');
const config = require('../config');

// Pickup-leg statuses that count as an active rider task.
const ACTIVE_STATES = ['rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up'];

// All admin-configurable dispatch settings (stored in SystemSetting).
const SETTING_KEYS = {
  maxActiveTasks: 'max_active_rider_tasks',
  maxPickupRadiusKm: 'max_pickup_radius_km',
  routeOptimization: 'route_optimization', // 'distance' | 'duration'
  distanceLimitKm: 'distance_limit_km',
};
const SETTING_DESC = {
  maxActiveTasks: 'Maximum active pickup tasks per rider',
  maxPickupRadiusKm: 'Maximum pickup radius (km) for available orders',
  routeOptimization: 'Route optimization preference (distance|duration)',
  distanceLimitKm: 'Maximum total route distance (km)',
};

let _cache = null;
let _cachedAt = 0;

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function defaults() {
  return {
    maxActiveTasks: config.rider.maxActiveTasks,
    maxPickupRadiusKm: 20,
    routeOptimization: 'distance',
    distanceLimitKm: 50,
  };
}

// Read all dispatch settings (cached 30s), falling back to defaults per key.
async function getDispatchSettings() {
  if (_cache && Date.now() - _cachedAt < 30000) return _cache;
  const d = defaults();
  const out = { ...d };
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { settingKey: { in: Object.values(SETTING_KEYS) } },
    });
    const map = {};
    rows.forEach((r) => { map[r.settingKey] = r.settingValue; });
    const ai = parseInt(map[SETTING_KEYS.maxActiveTasks], 10);
    const pr = parseFloat(map[SETTING_KEYS.maxPickupRadiusKm]);
    const dl = parseFloat(map[SETTING_KEYS.distanceLimitKm]);
    if (Number.isFinite(ai) && ai > 0) out.maxActiveTasks = ai;
    if (Number.isFinite(pr) && pr > 0) out.maxPickupRadiusKm = pr;
    if (Number.isFinite(dl) && dl > 0) out.distanceLimitKm = dl;
    if (map[SETTING_KEYS.routeOptimization] === 'duration' || map[SETTING_KEYS.routeOptimization] === 'distance') {
      out.routeOptimization = map[SETTING_KEYS.routeOptimization];
    }
  } catch (e) { /* fall back to defaults */ }
  _cache = out;
  _cachedAt = Date.now();
  return out;
}

function invalidateCache() { _cache = null; }

async function setDispatchSettings(patch) {
  const entries = Object.entries(patch).filter(([k]) => SETTING_KEYS[k]);
  for (const [k, v] of entries) {
    await prisma.systemSetting.upsert({
      where: { settingKey: SETTING_KEYS[k] },
      update: { settingValue: String(v) },
      create: { settingKey: SETTING_KEYS[k], settingValue: String(v), description: SETTING_DESC[k] },
    });
  }
  invalidateCache();
  return getDispatchSettings();
}

// ── Backward-compatible single-setting helpers (used by existing routes) ──
async function getMaxActiveTasks() { return (await getDispatchSettings()).maxActiveTasks; }
async function setMaxActiveTasks(value) { await setDispatchSettings({ maxActiveTasks: value }); return value; }
const invalidateMaxCache = invalidateCache;

function getActiveTaskCount(riderId) {
  return prisma.laundryRequest.count({
    where: { assignedRiderId: riderId, status: { in: ACTIVE_STATES } },
  });
}

// All active tasks for a rider, with the customer + linked laundromat joined
// (single query — no N+1).
function getRiderTasks(riderId) {
  return prisma.laundryRequest.findMany({
    where: { assignedRiderId: riderId, status: { in: ACTIVE_STATES } },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, phone: true, address: true } },
      provider: { select: { id: true, businessName: true, firstName: true, lastName: true, address: true, phone: true, latitude: true, longitude: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

// Nearest-neighbour pickup order starting from the rider's location.
// Returns an array of task ids (best-effort; tasks without coords go last).
function optimizePickupOrder(start, tasks) {
  const withCoords = tasks.filter((t) => t.pickupLatitude != null && t.pickupLongitude != null);
  const withoutCoords = tasks.filter((t) => t.pickupLatitude == null || t.pickupLongitude == null);

  if (!start || start.latitude == null || start.longitude == null) {
    return [...tasks].map((t) => t.id);
  }

  const remaining = [...withCoords];
  const order = [];
  let cur = { latitude: start.latitude, longitude: start.longitude };
  while (remaining.length) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = calculateDistance(cur.latitude, cur.longitude, remaining[i].pickupLatitude, remaining[i].pickupLongitude);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    const next = remaining.splice(best, 1)[0];
    order.push(next.id);
    cur = { latitude: next.pickupLatitude, longitude: next.pickupLongitude };
  }
  withoutCoords.forEach((t) => order.push(t.id));
  return order;
}

function providerName(p) {
  if (!p) return null;
  return p.businessName || `${p.firstName} ${p.lastName}'s Laundry`;
}

// Build the route summary: ordered legs (per-leg + cumulative km), totals, and
// the recommended next stop (nearest unvisited pickup).
function computeRoute(riderLoc, tasks, optimizedOrder) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = optimizedOrder.map((id) => byId.get(id)).filter(Boolean);

  let prev = riderLoc && riderLoc.latitude != null ? riderLoc : null;
  let cumulative = 0;
  const route = ordered.map((t) => {
    let legKm = null;
    if (prev && t.pickupLatitude != null && t.pickupLongitude != null) {
      legKm = Math.round(calculateDistance(prev.latitude, prev.longitude, t.pickupLatitude, t.pickupLongitude) * 100) / 100;
      cumulative += legKm;
    }
    if (t.pickupLatitude != null) prev = { latitude: t.pickupLatitude, longitude: t.pickupLongitude };
    return { taskId: t.id, legDistanceKm: legKm, cumulativeKm: Math.round(cumulative * 100) / 100 };
  });

  // Recommended next = first ordered stop still needing a pickup visit; else the
  // first picked-up stop (needs delivery to the laundromat); else none.
  let recommended = ordered.find((t) => ['rider_assigned', 'rider_on_the_way', 'rider_arrived'].includes(t.status));
  if (!recommended) recommended = ordered.find((t) => t.status === 'picked_up');

  return {
    route,
    totalDistanceKm: Math.round(cumulative * 100) / 100,
    estDurationMin: Math.round(cumulative * 3) + ordered.length * 2, // ~20km/h + 2min handling/stop
    recommendedNextId: recommended ? recommended.id : null,
  };
}

module.exports = {
  ACTIVE_STATES,
  calculateDistance,
  getMaxActiveTasks,
  setMaxActiveTasks,
  getDispatchSettings,
  setDispatchSettings,
  invalidateMaxCache,
  invalidateCache,
  getActiveTaskCount,
  getRiderTasks,
  optimizePickupOrder,
  computeRoute,
  providerName,
};
