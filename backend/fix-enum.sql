-- Fix PickupStatus enum migration
-- Run this directly in PostgreSQL

BEGIN;

-- Step 1: Drop defaults
ALTER TABLE laundry_requests ALTER COLUMN pickup_status DROP DEFAULT;
ALTER TABLE rider_assignments ALTER COLUMN status DROP DEFAULT;

-- Step 2: Update records - convert to text first, then to valid enum
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

-- Step 3: Rename enum
ALTER TYPE "PickupStatus" RENAME TO "PickupStatus_old";

-- Step 4: Create new enum
CREATE TYPE "PickupStatus" AS ENUM ('waiting_for_rider', 'rider_assigned', 'picked_up', 'delivered_to_laundry', 'cancelled');

-- Step 5: Update columns using text casting
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

-- Step 6: Set new defaults
ALTER TABLE laundry_requests 
  ALTER COLUMN pickup_status SET DEFAULT 'waiting_for_rider'::"PickupStatus";
ALTER TABLE rider_assignments 
  ALTER COLUMN status SET DEFAULT 'rider_assigned'::"PickupStatus";

-- Step 7: Drop old enum
DROP TYPE "PickupStatus_old";

COMMIT;
