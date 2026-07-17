const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const http = require('http');
const os = require('os');
const config = require('./config');
const prisma = require('./lib/prisma');
const logger = require('./lib/logger');
const { captureException, metricsMiddleware, metricsHandler } = require('./lib/monitoring');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}
const { initializeSocketIO } = require('./services/realtime');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const providerRoutes = require('./routes/provider');
const adminRoutes = require('./routes/admin');
const superadminRoutes = require('./routes/superadmin');
const supportRoutes = require('./routes/support');
const orderRoutes = require('./routes/orders');
const notificationRoutes = require('./routes/notifications');
const pricingRoutes = require('./routes/pricing');
const nearbyRoutes = require('./routes/nearby');
const favoritesRoutes = require('./routes/favorites');
const paymentRoutes = require('./routes/payments');
const reviewRoutes = require('./routes/reviews');
const analyticsRoutes = require('./routes/analytics');
const riderRoutes = require('./routes/rider');
const debugRoutes = require('./routes/debug');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO for real-time updates
initializeSocketIO(server);

// Correct client IPs when running behind Nginx / a load balancer (needed for
// accurate rate limiting and logs).
if (config.security.trustProxy) {
  app.set('trust proxy', 1);
}

// ── Security headers ──
app.use(helmet());

// ── Gzip responses ──
app.use(compression());

// ── CORS: allowlist in production, reflect any origin in dev ──
const corsBase = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
const corsOptions = config.security.corsOrigins.length === 0
  ? { ...corsBase, origin: true }
  : {
      ...corsBase,
      origin: (origin, cb) => {
        // Allow same-origin / mobile (no Origin header) and allowlisted web origins.
        if (!origin || config.security.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
    };
app.use(cors(corsOptions));

// ── Body parsing with explicit size limits (mitigates payload-DoS) ──
// Capture the raw body so payment webhooks can verify their HMAC signature.
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Structured request logging (pino) + metrics ──
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === '/api/health' || req.url === '/api/metrics' },
}));
app.use(metricsMiddleware);

// ── Health check (verifies DB connectivity) — registered before the rate
// limiter so monitors are never throttled. ──
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', app: config.app.name, version: '1.0.0', db: 'up', env: config.nodeEnv });
  } catch (e) {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// ── Prometheus metrics (before the limiter so scrapers aren't throttled) ──
app.get('/api/metrics', metricsHandler);

// ── Rate limiting ──
// Global, generous limit (NAT-safe).
const globalLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// Strict limiter for credential endpoints. Keyed by IP + email so brute-forcing
// a single account is blocked WITHOUT locking out other users behind the same
// NAT/campus IP.
const authLimiter = rateLimit({
  windowMs: config.security.rateLimit.authWindowMs,
  max: config.security.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body && req.body.email ? String(req.body.email).toLowerCase() : '')}`,
  // Token refresh + logout are routine (not credential guesses) — only the
  // global limiter applies to them.
  skip: (req) => req.originalUrl.includes('/auth/refresh') || req.originalUrl.includes('/auth/logout'),
  message: { errors: ['Too many attempts. Please wait a few minutes and try again.'] },
});

// ── API Routes ──
app.use('/api/auth', authLimiter, authRoutes); // credential endpoints rate-limited
app.use('/api/user', userRoutes);
app.use('/api/provider', providerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/nearby', nearbyRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/rider', riderRoutes);

// Debug routes leak internal data + stack traces — development only.
if (!config.isProd) {
  app.use('/api/debug', debugRoutes);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ── Global error handler — never leak internals in production ──
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  const status = err.status || 500;
  // 5xx are real problems → log + report; 4xx are client errors → quieter.
  if (status >= 500) {
    (req.log || logger).error({ err, path: req.originalUrl, method: req.method }, 'Unhandled error');
    captureException(err, { path: req.originalUrl, method: req.method, userId: req.user?.id });
  }
  res.status(status).json({
    error: config.isProd ? 'Internal server error.' : (err.message || 'Internal server error.'),
  });
});

const port = config.port || 3000;
server.listen(port, '0.0.0.0', () => {
  const localIP = getLocalIP();
  logger.info({ port, env: config.nodeEnv }, `${config.app.name} API running`);
  if (localIP && !config.isProd) {
    logger.info(`Device: set EXPO_PUBLIC_API_URL=http://${localIP}:${port}/api if 10.0.2.2 fails`);
  }
});

// ── Process-level safety net ──
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  captureException(err);
  shutdown('uncaughtException');
});

// ── Graceful shutdown — drain connections and close the DB pool ──
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');
  server.close(async () => {
    try { await prisma.$disconnect(); } catch (e) { /* ignore */ }
    logger.info('Closed HTTP server and DB connections');
    process.exit(0);
  });
  // Force-exit if connections don't drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
