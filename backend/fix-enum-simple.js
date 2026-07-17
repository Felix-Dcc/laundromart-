const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixEnum() {
  try {
    console.log('Fixing PickupStatus enum...\n');

    // Execute all SQL in one transaction
    const sql = `
      BEGIN;
      
      -- Drop defaults
      ALTER TABLE laundry_requests ALTER COLUMN pickup_status DROP DEFAULT;
      ALTER TABLE rider_assignments ALTER COLUMN status DROP DEFAULT;
      
      -- Update records using text
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
      
      -- Rename enum
      ALTER TYPE "PickupStatus" RENAME TO "PickupStatus_old";
      
      -- Create new enum
      CREATE TYPE "PickupStatus" AS ENUM ('waiting_for_rider', 'rider_assigned', 'picked_up', 'delivered_to_laundry', 'cancelled');
      
      -- Update columns
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
      
      -- Set defaults
      ALTER TABLE laundry_requests 
        ALTER COLUMN pickup_status SET DEFAULT 'waiting_for_rider'::"PickupStatus";
      ALTER TABLE rider_assignments 
        ALTER COLUMN status SET DEFAULT 'rider_assigned'::"PickupStatus";
      
      -- Drop old enum
      DROP TYPE "PickupStatus_old";
      
      COMMIT;
    `;

    await prisma.$executeRawUnsafe(sql);
    console.log('✅ Enum migration complete!');
    console.log('\nNow run: npx prisma generate');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixEnum();
