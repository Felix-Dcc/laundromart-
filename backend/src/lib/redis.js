/**
 * Shared Redis client (optional).
 *
 * When REDIS_URL is set, this connects a single client used for caching and a
 * readiness flag. When it's absent, everything no-ops and the app runs exactly
 * as before (single instance, no cache). Connection errors are non-fatal —
 * cache operations fall back to the database.
 */
const config = require('../config');

let client = null;
let ready = false;

if (config.redisUrl) {
  // eslint-disable-next-line global-require
  const Redis = require('ioredis');
  client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false, // fail fast → cache miss → hit DB, never hang requests
    lazyConnect: false,
  });
  client.on('ready', () => { ready = true; console.log('[redis] connected'); });
  client.on('error', (e) => { ready = false; if (process.env.NODE_ENV !== 'test') console.warn('[redis] error:', e.message); });
  client.on('end', () => { ready = false; });
}

module.exports = {
  hasRedis: !!config.redisUrl,
  getClient: () => client,
  isReady: () => ready,
};
