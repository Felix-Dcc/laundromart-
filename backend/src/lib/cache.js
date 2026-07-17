/**
 * Tiny cache helper over Redis. Every function is a safe no-op when Redis is
 * not configured or temporarily unavailable, so callers never need to branch.
 */
const { getClient, isReady } = require('./redis');

async function cacheGet(key) {
  if (!isReady()) return null;
  try {
    const v = await getClient().get(key);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds = 60) {
  if (!isReady()) return;
  try {
    await getClient().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (e) { /* ignore */ }
}

async function cacheDel(...keys) {
  if (!isReady() || keys.length === 0) return;
  try {
    await getClient().del(keys);
  } catch (e) { /* ignore */ }
}

/**
 * Return the cached value for `key`, or compute it with `fn`, cache it, return it.
 */
async function cacheWrap(key, ttlSeconds, fn) {
  const hit = await cacheGet(key);
  if (hit !== null) return hit;
  const value = await fn();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

// Cache keys (centralized so invalidation stays consistent).
const KEYS = {
  activePricing: 'pricing:active',
  activeProviders: 'providers:active',
};

module.exports = { cacheGet, cacheSet, cacheDel, cacheWrap, KEYS };
