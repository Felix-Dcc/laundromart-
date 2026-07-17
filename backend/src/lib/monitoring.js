/**
 * Monitoring: optional Sentry error tracking + Prometheus metrics.
 * Both degrade gracefully — Sentry is a no-op without SENTRY_DSN; metrics are
 * always collected (cheap) and exposed at /api/metrics.
 */
const config = require('../config');
const logger = require('./logger');

// ── Sentry (optional) ──
let Sentry = null;
if (config.monitoring.sentryDsn) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: config.monitoring.sentryDsn,
      environment: config.nodeEnv,
      tracesSampleRate: 0, // errors only; raise for performance tracing
    });
    logger.info('[monitoring] Sentry enabled');
  } catch (e) {
    Sentry = null;
    logger.warn({ err: e.message }, '[monitoring] Sentry init failed');
  }
}

function captureException(err, context) {
  try {
    if (Sentry) Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch (e) { /* never let monitoring throw */ }
}

// ── Prometheus metrics ──
const client = require('prom-client');
const register = new client.Registry();
register.setDefaultLabels({ app: 'laundromat-api' });
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});
const httpTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// Normalize paths so /orders/123 and /orders/456 share one label (bounded
// cardinality). Uses originalUrl, captured at entry (req.path mutates during
// routing through mounted routers).
function normalizeRoute(req) {
  const path = (req.originalUrl || req.url || '/').split('?')[0];
  return path.replace(/\/\d+/g, '/:id') || '/';
}

function metricsMiddleware(req, res, next) {
  if (req.path === '/api/metrics') return next();
  const route = normalizeRoute(req); // capture now — full path
  const endTimer = httpDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route, status: res.statusCode };
    endTimer(labels);
    httpTotal.inc(labels);
  });
  next();
}

async function metricsHandler(req, res) {
  // Optional token gate (set METRICS_TOKEN and have Prometheus send it).
  if (config.monitoring.metricsToken) {
    const provided = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
    if (provided !== config.monitoring.metricsToken) return res.status(401).end();
  }
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = { captureException, metricsMiddleware, metricsHandler, hasSentry: !!Sentry };
