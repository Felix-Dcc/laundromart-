/**
 * Structured logger (pino).
 * - Production: JSON to stdout (ready for log shippers / Docker / Loki).
 * - Development: pretty, colorized.
 * Sensitive fields (auth headers, passwords, tokens) are redacted.
 */
const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.monitoring.logLevel || (config.isProd ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'token',
      '*.token',
      'refreshToken',
      '*.refreshToken',
    ],
    remove: true,
  },
  ...(config.isProd
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } }),
});

module.exports = logger;
