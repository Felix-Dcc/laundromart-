require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

// ── Secrets: never run production with a default/weak/missing JWT secret ──
let jwtSecret = process.env.JWT_SECRET;
const weak = !jwtSecret || jwtSecret === 'fallback-secret-change-me' || jwtSecret.length < 32;
if (weak) {
  if (isProd) {
    // Fail fast — a forgeable token = full account takeover.
    console.error('FATAL: JWT_SECRET is missing or too weak (need 32+ chars) in production. Refusing to start.');
    process.exit(1);
  } else {
    jwtSecret = jwtSecret || 'dev-only-insecure-secret-change-me';
    console.warn('[config] Using a DEV JWT secret. Set a strong 32+ char JWT_SECRET before deploying to production.');
  }
}

// Comma-separated allowlist, e.g. "https://app.example.com,https://admin.example.com".
// Empty => reflect any origin (development convenience only).
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv,
  isProd,
  // Optional — enables horizontal Socket.IO + caching when set. Absent = single
  // instance, in-memory, no cache (fully functional, just not scaled out).
  redisUrl: process.env.REDIS_URL || '',
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d', // legacy (kept for reference)
    // Short-lived access token + long-lived rotating refresh token.
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS, 10) || 30,
  },
  app: {
    name: process.env.APP_NAME || 'LAUNDROMAT',
    currency: process.env.CURRENCY || 'GH₵',
    timezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
    recordsPerPage: parseInt(process.env.RECORDS_PER_PAGE, 10) || 10,
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH, 10) || 6,
  },
  rider: {
    // Default max concurrent pickup tasks per rider (admin-configurable at runtime
    // via the SystemSetting key `max_active_rider_tasks`).
    maxActiveTasks: parseInt(process.env.MAX_ACTIVE_RIDER_TASKS, 10) || 3,
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN || '',       // optional — error tracking
    metricsToken: process.env.METRICS_TOKEN || '',  // optional — protect /api/metrics
    logLevel: process.env.LOG_LEVEL || '',
  },
  payments: {
    // Leave keys blank to run in STUB/sandbox mode (simulated gateway) — the
    // payment flow works end-to-end for development without live credentials.
    paystackSecret: process.env.PAYSTACK_SECRET_KEY || '',
    paystackPublic: process.env.PAYSTACK_PUBLIC_KEY || '',
    stripeSecret: process.env.STRIPE_SECRET_KEY || '',
    currency: process.env.PAYMENT_CURRENCY || 'GHS',
  },
  // Cloudinary — service image hosting. The phone uploads directly using a
  // signature minted here, so the secret never leaves the server and large
  // files never transit the API. Empty => image endpoints report unconfigured
  // rather than failing obscurely.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'laundromart/services',
  },
  maps: {
    // Server-side Google Maps key (Geocoding API must be enabled; restrict by
    // IP, not Android app, since this is called from the backend). Empty =>
    // geocoding is skipped gracefully and providers keep any manual coordinates.
    googleKey: process.env.GOOGLE_MAPS_API_KEY || '',
  },
  security: {
    corsOrigins, // [] => allow all (dev)
    trustProxy: process.env.TRUST_PROXY === 'true', // true when behind Nginx/load balancer
    // reCAPTCHA v3 (admin dashboard login). Empty => verification skipped, so
    // login keeps working before keys are configured.
    recaptchaSecret: process.env.RECAPTCHA_SECRET_KEY || '',
    recaptchaMinScore: parseFloat(process.env.RECAPTCHA_MIN_SCORE) || 0.5,
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000,   // 1 min
      max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 1000,                // generous; NAT-safe
      authWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60_000, // 15 min
      authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20,         // per IP+email
    },
  },
};
