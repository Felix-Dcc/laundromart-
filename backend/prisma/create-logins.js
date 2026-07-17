/**
 * Creates a clean set of test logins — one per role — with memorable
 * credentials. Safe to re-run (upserts by email). Run with:
 *   node prisma/create-logins.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// One shared password for all test accounts (>= 6 chars).
const PASSWORD = 'password123';

const accounts = [
  {
    label: 'Customer',
    firstName: 'Test', lastName: 'Customer',
    email: 'customer@lms.com', phone: '0201112233',
    address: 'UCC Campus, Cape Coast',
    userType: 'user',
    latitude: 5.1153, longitude: -1.2908,
  },
  {
    label: 'Provider',
    firstName: 'Demo', lastName: 'Provider',
    email: 'myprovider@lms.com', phone: '0202223344',
    address: 'Science Faculty Area, UCC, Cape Coast',
    userType: 'provider',
    businessName: 'Demo Laundry Co.',
    businessHours: '7:00 AM – 9:00 PM',
    latitude: 5.1121, longitude: -1.2860,
  },
  {
    label: 'Rider',
    firstName: 'Demo', lastName: 'Rider',
    email: 'myrider@lms.com', phone: '0203334455',
    address: 'Cape Coast',
    userType: 'rider',
    latitude: 5.1100, longitude: -1.2820,
    riderStatus: 'offline',
  },
  {
    label: 'Superadmin',
    firstName: 'Demo', lastName: 'Admin',
    email: 'myadmin@lms.com', phone: '0204445566',
    address: 'Admin Office',
    userType: 'superadmin',
  },
];

async function main() {
  const hashed = await bcrypt.hash(PASSWORD, 10);
  console.log('Creating test logins...\n');

  for (const a of accounts) {
    const { label, ...data } = a;
    await prisma.user.upsert({
      where: { email: data.email },
      update: {
        // Reset password + keep coordinates fresh on re-run.
        password: hashed,
        status: 'active',
        emailVerified: true,
        ...(data.latitude != null ? { latitude: data.latitude, longitude: data.longitude } : {}),
        ...(data.businessName ? { businessName: data.businessName, businessHours: data.businessHours } : {}),
        ...(data.riderStatus ? { riderStatus: data.riderStatus } : {}),
      },
      create: {
        ...data,
        password: hashed,
        status: 'active',
        emailVerified: true,
      },
    });
    console.log(`  ${label.padEnd(9)} ${data.email.padEnd(22)} / ${PASSWORD}`);
  }

  console.log('\nDone. All accounts use the password:', PASSWORD);
}

main()
  .catch((e) => { console.error('Error creating logins:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
