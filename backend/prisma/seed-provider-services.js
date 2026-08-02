/**
 * One-time migration: give every provider their own services.
 *
 * Run this BEFORE the global service list is switched off. Until a provider
 * owns at least one service, customers would see an empty laundromat.
 *
 *   node prisma/seed-provider-services.js            # seed providers that have none
 *   node prisma/seed-provider-services.js --dry-run  # show what would happen
 *
 * Safe to run repeatedly: a provider that already owns services is skipped, so
 * this never duplicates rows or overwrites prices a provider has set themselves.
 *
 * Prices vary per provider on purpose — the whole point of the migration is that
 * laundromats compete on their own pricing rather than sharing one platform rate.
 */
// Railway injects the INTERNAL database host (postgres.railway.internal), which
// only resolves inside Railway's private network. `railway run` executes on your
// own machine, so swap in the public proxy URL when one is available. Must run
// BEFORE the Prisma client is required, since it reads DATABASE_URL at init.
(function preferPublicDatabaseUrl() {
  const current = process.env.DATABASE_URL || '';
  if (!/\.railway\.internal/.test(current)) return;
  const publicUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL_PUBLIC;
  if (publicUrl) {
    process.env.DATABASE_URL = publicUrl;
    console.log('Using the public database URL (the internal host is not reachable from your machine).');
  } else {
    console.error('DATABASE_URL points at Railway\'s INTERNAL host, which only works inside Railway.');
    console.error('No DATABASE_PUBLIC_URL was provided, so this cannot connect from your machine.\n');
    console.error('Either:');
    console.error('  1. Run it inside the container — Railway → backend service → one-off command:');
    console.error('       node prisma/seed-provider-services.js --dry-run');
    console.error('  2. Or enable public networking on the Postgres service and re-run, so');
    console.error('     DATABASE_PUBLIC_URL becomes available.');
    process.exit(1);
  }
})();

const prisma = require('../src/lib/prisma');

const DRY = process.argv.includes('--dry-run');

// A realistic starter catalogue. Providers edit or delete these from
// Provider Dashboard → Business → My Services.
const CATALOGUE = [
  {
    name: 'Wash & Fold',
    category: 'Wash & Fold',
    description: 'Everyday laundry washed, dried and neatly folded. Ideal for regular household loads.',
    pricingType: 'per_kg',
    base: 12,
    estimatedCompletionHours: 24,
  },
  {
    name: 'Express Wash',
    category: 'Express Wash',
    description: 'Same-day turnaround when you need your clothes back fast. Washed, dried and folded within hours.',
    pricingType: 'per_kg',
    base: 20,
    estimatedCompletionHours: 6,
  },
  {
    name: 'Ironing Only',
    category: 'Ironing',
    description: 'Professionally pressed and hung. Bring your clean clothes and collect them crisp.',
    pricingType: 'per_kg',
    base: 6,
    estimatedCompletionHours: 12,
  },
  {
    name: 'Dry Cleaning',
    category: 'Dry Cleaning',
    description: 'Specialist cleaning for suits, dresses and delicate fabrics that cannot be machine washed.',
    pricingType: 'fixed',
    base: 45,
    estimatedCompletionHours: 48,
  },
];

// Deterministic per-provider variation so prices differ between laundromats but
// stay stable if the script is re-run.
function priceFor(base, providerId) {
  const jitter = ((providerId * 7) % 5) - 2; // -2 … +2
  return Math.max(1, Math.round((base + jitter) * 100) / 100);
}

// Report — and sanity-check — which database we are about to touch. `railway
// run` executes locally, so if the linked service does not expose DATABASE_URL,
// dotenv silently falls back to the local .env and you seed the wrong database.
// That is easy to miss because a dev database also has providers in it.
function describeTarget() {
  const raw = process.env.DATABASE_URL || '';
  let host = 'unknown', db = 'unknown';
  try { const u = new URL(raw); host = u.hostname; db = u.pathname.slice(1); } catch { /* ignore */ }
  const isLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(host);
  console.log(`Target database: ${db} @ ${host}${isLocal ? '  ← LOCAL' : '  (remote)'}\n`);
  if (isLocal && !process.argv.includes('--allow-local')) {
    console.error('Refusing to run against a LOCAL database.');
    console.error('Your customers are on the Railway database, so seeding localhost would appear to work and change nothing.');
    console.error('');
    console.error('  Run it against production:  railway run node prisma/seed-provider-services.js --dry-run');
    console.error('  (make sure `railway link` selected the BACKEND service, which is what exposes DATABASE_URL)');
    console.error('');
    console.error('  If you really do want to seed your local dev database, add --allow-local');
    process.exit(1);
  }
}

async function main() {
  describeTarget();

  const providers = await prisma.user.findMany({
    where: { userType: 'provider', status: 'active' },
    select: { id: true, businessName: true, firstName: true, lastName: true },
    orderBy: { id: 'asc' },
  });

  if (!providers.length) {
    console.log('No active providers found — nothing to do.');
    return;
  }

  console.log(`${DRY ? '[dry run] ' : ''}Found ${providers.length} active provider(s).\n`);
  let seeded = 0, skipped = 0, created = 0;

  for (const p of providers) {
    const label = p.businessName || `${p.firstName} ${p.lastName}`;
    const existing = await prisma.laundryService.count({
      where: { providerId: p.id, deletedAt: null },
    });

    if (existing > 0) {
      console.log(`  – ${label} (#${p.id}) already has ${existing} service(s) — skipped`);
      skipped++;
      continue;
    }

    const rows = CATALOGUE.map((s) => {
      const price = priceFor(s.base, p.id);
      return {
        providerId: p.id,
        name: s.name,
        description: s.description,
        category: s.category,
        pricingType: s.pricingType,
        pricePerKg: s.pricingType === 'per_kg' ? price : null,
        fixedPrice: s.pricingType === 'fixed' ? price : null,
        pricePerItem: s.pricingType === 'per_item' ? price : null,
        estimatedCompletionHours: s.estimatedCompletionHours,
        status: 'available',
      };
    });

    if (DRY) {
      console.log(`  + ${label} (#${p.id}) would get: ${rows.map((r) => `${r.name} @ ${r.pricePerKg ?? r.fixedPrice ?? r.pricePerItem}`).join(', ')}`);
    } else {
      await prisma.laundryService.createMany({ data: rows });
      console.log(`  + ${label} (#${p.id}) seeded ${rows.length} services`);
      created += rows.length;
    }
    seeded++;
  }

  console.log(`\n${DRY ? '[dry run] ' : ''}Providers seeded: ${seeded} · skipped: ${skipped}${DRY ? '' : ` · services created: ${created}`}`);
  if (!DRY) console.log('Providers can now edit or remove these in Business → My Services.');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
