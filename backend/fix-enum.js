const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixEnum() {
  try {
    console.log('Updating PickupStatus enum in database...');

    // First, update existing records to use a temporary value or keep old values
    // Then alter the enum
    await prisma.$executeRawUnsafe(`
      -- Update existing records to valid values first
      UPDATE laundry_requests 
      SET pickup_status = CASE 
        WHEN pickup_status = 'pending' THEN 'waiting_for_rider'
        WHEN pickup_status = 'assigned' THEN 'waiting_for_rider'
        WHEN pickup_status = 'accepted' THEN 'rider_assigned'
        WHEN pickup_status = 'rejected' THEN 'cancelled'
        WHEN pickup_status = 'in_transit' THEN 'rider_assigned'
        ELSE pickup_status
      END::text
      WHERE pickup_status IN ('pending', 'assigned', 'accepted', 'rejected', 'in_transit');
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE rider_assignments 
      SET status = CASE 
        WHEN status = 'pending' THEN 'rider_assigned'
        WHEN status = 'assigned' THEN 'rider_assigned'
        WHEN status = 'accepted' THEN 'rider_assigned'
        WHEN status = 'rejected' THEN 'cancelled'
        WHEN status = 'in_transit' THEN 'rider_assigned'
        ELSE status
      END::text
      WHERE status IN ('pending', 'assigned', 'accepted', 'rejected', 'in_transit');
    `);

    // Now alter the enum type
    await prisma.$executeRawUnsafe(`
      -- Create new enum with new values
      DO $$ 
      BEGIN
        -- Drop old enum if it exists and create new one
        DROP TYPE IF EXISTS "PickupStatus_new" CASCADE;
        CREATE TYPE "PickupStatus_new" AS ENUM ('waiting_for_rider', 'rider_assigned', 'picked_up', 'delivered_to_laundry', 'cancelled');
        
        -- Alter columns to use new enum
        ALTER TABLE laundry_requests 
          ALTER COLUMN pickup_status TYPE "PickupStatus_new" 
          USING pickup_status::text::"PickupStatus_new";
        
        ALTER TABLE rider_assignments 
          ALTER COLUMN status TYPE "PickupStatus_new" 
          USING status::text::"PickupStatus_new";
        
        -- Drop old enum and rename new one
        DROP TYPE IF EXISTS "PickupStatus" CASCADE;
        ALTER TYPE "PickupStatus_new" RENAME TO "PickupStatus";
      END $$;
    `);

    console.log('Enum updated successfully!');
  } catch (error) {
    console.error('Error updating enum:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixEnum();
