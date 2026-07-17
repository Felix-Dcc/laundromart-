const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const steps = [
  { name: 'Drop defaults', sql: `ALTER TABLE laundry_requests ALTER COLUMN pickup_status DROP DEFAULT;` },
  { name: 'Drop defaults (assignments)', sql: `ALTER TABLE rider_assignments ALTER COLUMN status DROP DEFAULT;` },
  { name: 'Update laundry_requests records', sql: `
    UPDATE laundry_requests 
    SET pickup_status = (
      CASE pickup_status::text
        WHEN 'pending' THEN 'picked_up'
        WHEN 'assigned' THEN 'picked_up'
        WHEN 'accepted' THEN 'picked_up'
        WHEN 'in_transit' THEN 'picked_up'
        WHEN 'rejected' THEN 'cancelled'
        ELSE pickup_status::text
      END
    )::"PickupStatus";
  ` },
  { name: 'Update rider_assignments records', sql: `
    UPDATE rider_assignments 
    SET status = (
      CASE status::text
        WHEN 'pending' THEN 'picked_up'
        WHEN 'assigned' THEN 'picked_up'
        WHEN 'accepted' THEN 'picked_up'
        WHEN 'in_transit' THEN 'picked_up'
        WHEN 'rejected' THEN 'cancelled'
        ELSE status::text
      END
    )::"PickupStatus";
  ` },
  { name: 'Rename enum', sql: `ALTER TYPE "PickupStatus" RENAME TO "PickupStatus_old";` },
  { name: 'Create new enum', sql: `CREATE TYPE "PickupStatus" AS ENUM ('waiting_for_rider', 'rider_assigned', 'picked_up', 'delivered_to_laundry', 'cancelled');` },
  { name: 'Update laundry_requests column', sql: `
    ALTER TABLE laundry_requests 
      ALTER COLUMN pickup_status TYPE "PickupStatus" 
      USING (
        CASE pickup_status::text
          WHEN 'picked_up' THEN 'waiting_for_rider'::"PickupStatus"
          WHEN 'cancelled' THEN 'cancelled'::"PickupStatus"
          WHEN 'delivered_to_laundry' THEN 'delivered_to_laundry'::"PickupStatus"
          ELSE 'waiting_for_rider'::"PickupStatus"
        END
      );
  ` },
  { name: 'Update rider_assignments column', sql: `
    ALTER TABLE rider_assignments 
      ALTER COLUMN status TYPE "PickupStatus" 
      USING (
        CASE status::text
          WHEN 'picked_up' THEN 'rider_assigned'::"PickupStatus"
          WHEN 'cancelled' THEN 'cancelled'::"PickupStatus"
          WHEN 'delivered_to_laundry' THEN 'delivered_to_laundry'::"PickupStatus"
          ELSE 'rider_assigned'::"PickupStatus"
        END
      );
  ` },
  { name: 'Set default (laundry_requests)', sql: `ALTER TABLE laundry_requests ALTER COLUMN pickup_status SET DEFAULT 'waiting_for_rider'::"PickupStatus";` },
  { name: 'Set default (rider_assignments)', sql: `ALTER TABLE rider_assignments ALTER COLUMN status SET DEFAULT 'rider_assigned'::"PickupStatus";` },
  { name: 'Drop old enum', sql: `DROP TYPE "PickupStatus_old";` },
];

async function fixEnum() {
  try {
    console.log('Fixing PickupStatus enum...\n');

    for (const step of steps) {
      console.log(`Running: ${step.name}...`);
      await prisma.$executeRawUnsafe(step.sql);
      console.log(`✓ ${step.name}\n`);
    }

    console.log('✅ Enum migration complete!');
    console.log('\nNext steps:');
    console.log('1. Stop the backend server');
    console.log('2. Run: npx prisma generate');
    console.log('3. Restart the server');
  } catch (error) {
    console.error(`\n❌ Error at step: ${steps.find(s => !s.completed)?.name || 'unknown'}`);
    console.error('Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixEnum();
