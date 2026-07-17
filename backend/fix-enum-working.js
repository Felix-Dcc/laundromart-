const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixEnum() {
  try {
    console.log('Fixing PickupStatus enum...');

    // Step 1: Drop defaults
    await prisma.$executeRawUnsafe(`
      ALTER TABLE laundry_requests ALTER COLUMN pickup_status DROP DEFAULT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE rider_assignments ALTER COLUMN status DROP DEFAULT;
    `);
    console.log('✓ Dropped defaults');

    // Step 2: Update records to text, then to valid enum values
    await prisma.$executeRawUnsafe(`
      UPDATE laundry_requests 
      SET pickup_status = CASE 
        WHEN pickup_status::text IN ('pending', 'assigned', 'accepted', 'in_transit') THEN 'picked_up'::"PickupStatus"
        WHEN pickup_status::text = 'rejected' THEN 'cancelled'::"PickupStatus"
        ELSE pickup_status
      END;
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE rider_assignments 
      SET status = CASE 
        WHEN status::text IN ('pending', 'assigned', 'accepted', 'in_transit') THEN 'picked_up'::"PickupStatus"
        WHEN status::text = 'rejected' THEN 'cancelled'::"PickupStatus"
        ELSE status
      END;
    `);
    console.log('✓ Updated records to valid values');

    // Step 3: Rename enum
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "PickupStatus" RENAME TO "PickupStatus_old";
    `);
    console.log('✓ Renamed enum');

    // Step 4: Create new enum
    await prisma.$executeRawUnsafe(`
      CREATE TYPE "PickupStatus" AS ENUM ('waiting_for_rider', 'rider_assigned', 'picked_up', 'delivered_to_laundry', 'cancelled');
    `);
    console.log('✓ Created new enum');

    // Step 5: Change column types using text casting
    await prisma.$executeRawUnsafe(`
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
    `);

    await prisma.$executeRawUnsafe(`
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
    `);
    console.log('✓ Updated column types');

    // Step 6: Set new defaults
    await prisma.$executeRawUnsafe(`
      ALTER TABLE laundry_requests 
        ALTER COLUMN pickup_status SET DEFAULT 'waiting_for_rider'::"PickupStatus";
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE rider_assignments 
        ALTER COLUMN status SET DEFAULT 'rider_assigned'::"PickupStatus";
    `);
    console.log('✓ Set new defaults');

    // Step 7: Drop old enum
    await prisma.$executeRawUnsafe(`
      DROP TYPE "PickupStatus_old";
    `);
    console.log('✓ Dropped old enum');

    console.log('\n✅ Enum migration complete!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixEnum();
