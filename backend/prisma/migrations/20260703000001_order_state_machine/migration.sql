-- ============================================================
-- Single authoritative order lifecycle.
-- Collapses status + pickup_status + service_status into one
-- OrderStatus field, backfilling every existing order, then drops
-- the old columns/enums. Adds the return-leg delivery rider.
-- ============================================================

-- 1. New unified status enum
CREATE TYPE "OrderStatus" AS ENUM (
  'created',
  'awaiting_rider',
  'rider_assigned',
  'rider_on_the_way',
  'rider_arrived',
  'picked_up',
  'at_laundromat',
  'preparing',
  'washing',
  'drying',
  'ironing',
  'ready_for_delivery',
  'delivery_rider_assigned',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
  'failed',
  'refunded'
);

-- 2. Add the new column (nullable for now) + the return-leg rider column
ALTER TABLE "laundry_requests" ADD COLUMN "status_new" "OrderStatus";
ALTER TABLE "laundry_requests" ADD COLUMN "delivery_rider_id" INTEGER;

-- 3. Backfill: derive the single status from the most-advanced old field.
UPDATE "laundry_requests" SET "status_new" = (
  CASE
    WHEN "status"::text = 'cancelled'                     THEN 'cancelled'
    WHEN "service_status"::text = 'delivered_to_user'     THEN 'completed'
    WHEN "service_status"::text = 'ready_for_delivery'    THEN 'ready_for_delivery'
    WHEN "service_status"::text = 'washing'               THEN 'washing'
    WHEN "service_status"::text = 'preparing_to_wash'     THEN 'preparing'
    WHEN "pickup_status"::text = 'delivered_to_laundry'   THEN 'at_laundromat'
    WHEN "pickup_status"::text = 'picked_up'              THEN 'picked_up'
    WHEN "pickup_status"::text = 'arrived_at_pickup'      THEN 'rider_arrived'
    WHEN "pickup_status"::text = 'rider_assigned'         THEN 'rider_assigned'
    WHEN "pickup_status"::text = 'waiting_for_rider'      THEN 'awaiting_rider'
    ELSE 'created'
  END
)::"OrderStatus";

-- 4. Drop old status columns (auto-drops their indexes)
ALTER TABLE "laundry_requests" DROP COLUMN "status";
ALTER TABLE "laundry_requests" DROP COLUMN "pickup_status";
ALTER TABLE "laundry_requests" DROP COLUMN "service_status";

-- 5. Promote the new column to be THE status column
ALTER TABLE "laundry_requests" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "laundry_requests" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "laundry_requests" ALTER COLUMN "status" SET DEFAULT 'created';

-- 6. rider_assignments: drop the legacy parallel status field (auto-drops its index)
ALTER TABLE "rider_assignments" DROP COLUMN "status";

-- 7. Indexes for the (recreated) status column + the new delivery rider
CREATE INDEX "laundry_requests_status_idx" ON "laundry_requests"("status");
CREATE INDEX "laundry_requests_delivery_rider_id_idx" ON "laundry_requests"("delivery_rider_id");

-- 8. FK for the return-leg rider
ALTER TABLE "laundry_requests"
  ADD CONSTRAINT "laundry_requests_delivery_rider_id_fkey"
  FOREIGN KEY ("delivery_rider_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 9. Retire the now-unused enums
DROP TYPE "RequestStatus";
DROP TYPE "PickupStatus";
DROP TYPE "ServiceStatus";
