/**
 * Single shared PrismaClient for the whole process.
 *
 * Previously every route file did `new PrismaClient()`, so each opened its own
 * connection pool — under load that exhausts Postgres connections. Import this
 * singleton instead: `const prisma = require('../lib/prisma');`
 *
 * (Migrating the existing routes to this is a follow-up step; new code and the
 * health check use it now.)
 */
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma = globalForPrisma.__prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') {
  // Avoid creating new clients on hot-reload during development.
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
