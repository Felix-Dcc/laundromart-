const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const steps = [
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
    console.log('Continuing PickupStatus enum migration...\n');

    for (const step of steps) {
      try {
        console.log(`Running: ${step.name}...`);
        await prisma.$executeRawUnsafe(step.sql);
        console.log(`✓ ${step.name}\n`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠ ${step.name} - already done, skipping\n`);
        } else {
          throw error;
        }
      }
    }

    console.log('✅ Enum migration complete!');
    console.log('\nNext: Run "npx prisma generate" (stop server first)');
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixEnum();
