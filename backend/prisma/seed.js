const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const hashedPassword = await bcrypt.hash('password', 10);
  // Demo per-role logins use a distinct, clearly-labelled password.
  const demoPassword = await bcrypt.hash('password123', 10);

  // ── Admin ──
  await prisma.user.upsert({
    where: { email: 'admin@lms.com' },
    update: {},
    create: {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@lms.com',
      phone: '1234567890',
      address: 'Admin Address',
      password: hashedPassword,
      userType: 'admin',
      status: 'active',
      emailVerified: true,
    },
  });

  // ── Demo accounts (one clean login per role, incl. a customer) ──
  const demoAccounts = [
    {
      firstName: 'Test', lastName: 'Customer',
      email: 'customer@lms.com', phone: '0201112233',
      address: 'UCC Campus, Cape Coast',
      userType: 'user',
      latitude: 5.1153, longitude: -1.2908,
    },
    {
      firstName: 'Demo', lastName: 'Provider',
      email: 'myprovider@lms.com', phone: '0202223344',
      address: 'Science Faculty Area, UCC, Cape Coast',
      userType: 'provider',
      businessName: 'Demo Laundry Co.',
      businessHours: '7:00 AM – 9:00 PM',
      latitude: 5.1121, longitude: -1.2860,
    },
    {
      firstName: 'Demo', lastName: 'Rider',
      email: 'myrider@lms.com', phone: '0203334455',
      address: 'Cape Coast',
      userType: 'rider',
      latitude: 5.1100, longitude: -1.2820,
      riderStatus: 'offline',
    },
    {
      firstName: 'Demo', lastName: 'Admin',
      email: 'myadmin@lms.com', phone: '0204445566',
      address: 'Admin Office',
      userType: 'superadmin',
    },
  ];

  for (const a of demoAccounts) {
    await prisma.user.upsert({
      where: { email: a.email },
      update: {
        ...(a.latitude != null ? { latitude: a.latitude, longitude: a.longitude } : {}),
        ...(a.businessName ? { businessName: a.businessName, businessHours: a.businessHours } : {}),
        ...(a.riderStatus ? { riderStatus: a.riderStatus } : {}),
      },
      create: {
        ...a,
        password: demoPassword,
        status: 'active',
        emailVerified: true,
      },
    });
  }

  // ── Riders (with coordinates for demo) ──
  const riders = [
    {
      firstName: 'John',
      lastName: 'Rider',
      email: 'rider@lms.com',
      phone: '0241234567',
      address: 'Accra, Ghana',
      latitude: 5.6037,
      longitude: -0.1870,
      riderStatus: 'offline',
    },
    {
      firstName: 'Mike',
      lastName: 'Courier',
      email: 'rider2@lms.com',
      phone: '0247654321',
      address: 'Accra, Ghana',
      latitude: 5.5560,
      longitude: -0.1870,
      riderStatus: 'offline',
    },
  ];

  for (const r of riders) {
    await prisma.user.upsert({
      where: { email: r.email },
      update: {
        latitude: r.latitude,
        longitude: r.longitude,
        riderStatus: r.riderStatus,
      },
      create: {
        ...r,
        password: hashedPassword,
        userType: 'rider',
        status: 'active',
        emailVerified: true,
        riderStatus: r.riderStatus,
        totalPickups: 0,
        totalEarnings: 0.0,
      },
    });
  }

  // ── Providers (with real-ish coordinates for demo) ──
  const providers = [
    // --- Accra providers (original) ---
    {
      firstName: 'CleanPro',
      lastName: 'Laundry',
      email: 'provider@lms.com',
      phone: '0987654321',
      address: '12 Main St, Accra',
      businessName: 'CleanPro Express',
      businessHours: '8:00 AM – 8:00 PM',
      latitude: 5.6145,
      longitude: -0.2053,
    },
    {
      firstName: 'Fresh',
      lastName: 'Wash',
      email: 'freshwash@lms.com',
      phone: '0551234567',
      address: '45 Oxford St, Osu, Accra',
      businessName: 'Fresh Wash Hub',
      businessHours: '7:00 AM – 9:00 PM',
      latitude: 5.5560,
      longitude: -0.1870,
    },
    {
      firstName: 'Sparkle',
      lastName: 'Clean',
      email: 'sparkle@lms.com',
      phone: '0267891234',
      address: '8 Ring Rd, East Legon, Accra',
      businessName: 'Sparkle & Shine',
      businessHours: '9:00 AM – 6:00 PM',
      latitude: 5.6350,
      longitude: -0.1590,
    },
    {
      firstName: 'QuickDry',
      lastName: 'Services',
      email: 'quickdry@lms.com',
      phone: '0301234567',
      address: '22 Spintex Rd, Accra',
      businessName: 'QuickDry Laundromat',
      businessHours: '6:00 AM – 10:00 PM',
      latitude: 5.6380,
      longitude: -0.1240,
    },
    // --- Cape Coast / UCC providers (development seed) ---
    {
      firstName: 'Campus',
      lastName: 'Wash',
      email: 'campuswash@lms.com',
      phone: '0241001001',
      address: 'Science Faculty Area, UCC Campus, Cape Coast',
      businessName: 'Campus Wash & Fold',
      businessHours: '7:00 AM – 9:00 PM',
      latitude: 5.1153,
      longitude: -1.2908,
    },
    {
      firstName: 'Cape',
      lastName: 'Clean',
      email: 'capeclean@lms.com',
      phone: '0241001002',
      address: 'Oguaa Hall Road, UCC, Cape Coast',
      businessName: 'Cape Clean Laundry',
      businessHours: '6:30 AM – 8:00 PM',
      latitude: 5.1121,
      longitude: -1.2860,
    },
    {
      firstName: 'Atlantic',
      lastName: 'Laundry',
      email: 'atlantic@lms.com',
      phone: '0241001003',
      address: 'Abura, Near Cape Coast Stadium, Cape Coast',
      businessName: 'Atlantic Laundromat',
      businessHours: '8:00 AM – 7:00 PM',
      latitude: 5.1050,
      longitude: -1.2466,
    },
    {
      firstName: 'Castle',
      lastName: 'Wash',
      email: 'castlewash@lms.com',
      phone: '0241001004',
      address: 'Commercial St, Near Cape Coast Castle, Cape Coast',
      businessName: 'Castle Wash Express',
      businessHours: '7:00 AM – 8:00 PM',
      latitude: 5.1063,
      longitude: -1.2410,
    },
    {
      firstName: 'Casford',
      lastName: 'Laundry',
      email: 'casford@lms.com',
      phone: '0241001005',
      address: 'STC Road, Casford Hall Area, UCC, Cape Coast',
      businessName: 'Casford Laundry Hub',
      businessHours: '6:00 AM – 10:00 PM',
      latitude: 5.1098,
      longitude: -1.2935,
    },
    {
      firstName: 'Kotokuraba',
      lastName: 'Wash',
      email: 'kotokuraba@lms.com',
      phone: '0241001006',
      address: 'Kotokuraba Market Area, Cape Coast',
      businessName: 'Kotokuraba Quick Wash',
      businessHours: '7:30 AM – 6:30 PM',
      latitude: 5.1080,
      longitude: -1.2500,
    },
    {
      firstName: 'Pedu',
      lastName: 'Laundry',
      email: 'pedu@lms.com',
      phone: '0241001007',
      address: 'Pedu Junction, Cape Coast',
      businessName: 'Pedu Fresh Laundry',
      businessHours: '8:00 AM – 8:00 PM',
      latitude: 5.1185,
      longitude: -1.2635,
    },
    {
      firstName: 'OLA',
      lastName: 'Wash',
      email: 'olawash@lms.com',
      phone: '0241001008',
      address: 'OLA Road, Near UCC Main Gate, Cape Coast',
      businessName: 'OLA Sparkle Wash',
      businessHours: '7:00 AM – 9:00 PM',
      latitude: 5.1100,
      longitude: -1.2820,
    },
  ];

  for (const p of providers) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: {
        latitude: p.latitude,
        longitude: p.longitude,
        businessName: p.businessName,
        businessHours: p.businessHours,
      },
      create: {
        ...p,
        password: hashedPassword,
        userType: 'provider',
        status: 'active',
        emailVerified: true,
      },
    });
  }

  // ── Laundry pricing ──
  const pricingData = [
    { serviceType: 'Regular Wash', pricePerKg: 5.00, description: 'Standard washing and drying service' },
    { serviceType: 'Dry Cleaning', pricePerKg: 15.00, description: 'Professional dry cleaning service' },
    { serviceType: 'Express Service', pricePerKg: 8.00, description: 'Same day wash and dry service' },
    { serviceType: 'Delicate Items', pricePerKg: 12.00, description: 'Special care for delicate fabrics' },
    { serviceType: 'Ironing Only', pricePerKg: 3.00, description: 'Ironing service only' },
  ];

  for (const pricing of pricingData) {
    await prisma.laundryPricing.upsert({
      where: { id: pricingData.indexOf(pricing) + 1 },
      update: {},
      create: pricing,
    });
  }

  // ── System settings ──
  const settings = [
    { settingKey: 'site_name', settingValue: 'Laundry Management System', description: 'Website name' },
    { settingKey: 'site_email', settingValue: 'info@lms.com', description: 'System email address' },
    { settingKey: 'currency', settingValue: 'USD', description: 'Default currency' },
    { settingKey: 'tax_rate', settingValue: '10', description: 'Tax rate percentage' },
    { settingKey: 'pickup_time_slots', settingValue: '09:00,10:00,11:00,14:00,15:00,16:00', description: 'Available pickup time slots' },
    { settingKey: 'delivery_time_slots', settingValue: '09:00,10:00,11:00,14:00,15:00,16:00', description: 'Available delivery time slots' },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { settingKey: setting.settingKey },
      update: {},
      create: setting,
    });
  }

  console.log('Seed completed!');
  console.log('  Admin:     admin@lms.com / password');
  console.log('  Providers (Accra):      provider@lms.com, freshwash@lms.com, sparkle@lms.com, quickdry@lms.com / password');
  console.log('  Providers (Cape Coast): campuswash@lms.com, capeclean@lms.com, atlantic@lms.com, castlewash@lms.com, casford@lms.com, kotokuraba@lms.com, pedu@lms.com, olawash@lms.com / password');
  console.log('  Riders:    rider@lms.com, rider2@lms.com / password');
  console.log('');
  console.log('  Demo logins (one per role) — password123:');
  console.log('    Customer:  customer@lms.com   / password123');
  console.log('    Provider:  myprovider@lms.com / password123');
  console.log('    Rider:     myrider@lms.com    / password123');
  console.log('    Admin:     myadmin@lms.com    / password123');
}

main()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
