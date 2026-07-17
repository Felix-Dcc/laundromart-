const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixEnum() {
  try {
    console.log('Fixing PickupStatus enum...');

    // Step 1: Update all records to use existing valid enum values
    // Map old values to existing valid ones temporarily
    await prisma.$executeRawUnsafe(`
      UPDATE laundry_requests 
      SET pickup_status = CASE 
        WHEN pickup_status::text = 'pending' THEN 'picked_up'::"PickupStatus"
        WHEN pickup_status::text = 'assigned' THEN 'picked_up'::"PickupStatus"
        WHEN pickup_status::text = 'accepted' THEN 'picked_up'::"PickupStatus"
        WHEN pickup_status::text = 'rejected' THEN 'cancelled'::"PickupStatus"
        WHEN pickup_status::text = 'in_transit' THEN 'picked_up'::"PickupStatus"
        ELSE pickup_status
      END
      WHERE pickup_status::text IN ('pending', 'assigned', 'accepted', 'rejected', 'in_transit');
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE rider_assignments 
      SET status = CASE 
        WHEN status::text = 'pending' THEN 'picked_up'::"PickupStatus"
        WHEN status::text = 'assigned' THEN 'picked_up'::"PickupStatus"
        WHEN status::text = 'accepted' THEN 'picked_up'::"PickupStatus"
        WHEN status::text = 'rejected' THEN 'cancelled'::"PickupStatus"
        WHEN status::text = 'in_transit' THEN 'picked_up'::"PickupStatus"
        ELSE status
      END
      WHERE status::text IN ('pending', 'assigned', 'accepted', 'rejected', 'in_transit');
    `);

    console.log('Step 1: Updated records to temporary values');

    // Step 2: Alter the enum type
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "PickupStatus" RENAME TO "PickupStatus_old";
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TYPE "PickupStatus" AS ENUM ('waiting_for_rider', 'rider_assigned', 'picked_up', 'delivered_to_laundry', 'cancelled');
    `);

    console.log('Step 2: Created new enum');

    // Step 3: Update columns to use new enum
    await prisma.$executeRawUnsafe(`
      ALTER TABLE laundry_requests 
        ALTER COLUMN pickup_status TYPE "PickupStatus" 
        USING CASE 
          WHEN pickup_status::text = 'picked_up' THEN 'waiting_for_rider'::"PickupStatus"
          WHEN pickup_status::text = 'cancelled' THEN 'cancelled'::"PickupStatus"
          WHEN pickup_status::text = 'delivered_to_laundry' THEN 'delivered_to_laundry'::"PickupStatus"
          ELSE 'waiting_for_rider'::"PickupStatus"
        END;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE rider_assignments 
        ALTER COLUMN status TYPE "PickupStatus" 
        USING CASE 
          WHEN status::text = 'picked_up' THEN 'rider_assigned'::"PickupStatus"
          WHEN status::text = 'cancelled' THEN 'cancelled'::"PickupStatus"
          WHEN status::text = 'delivered_to_laundry' THEN 'delivered_to_laundry'::"PickupStatus"
          ELSE 'rider_assigned'::"PickupStatus"
        END;
    `);

    console.log('Step 3: Updated columns to new enum');

    // Step 4: Drop old enum
    await prisma.$executeRawUnsafe(`
      DROP TYPE "PickupStatus_old";
    `);

    console.log('Step 4: Dropped old enum');
    console.log('Enum migration complete!');
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixEnum();
