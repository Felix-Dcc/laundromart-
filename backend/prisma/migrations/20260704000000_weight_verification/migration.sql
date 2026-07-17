-- Verified pricing: provider confirms actual weight → final amount.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'weight_verified';

ALTER TABLE "laundry_requests" ADD COLUMN "actual_weight_kg" DECIMAL(5,2);
ALTER TABLE "laundry_requests" ADD COLUMN "weight_verified_at" TIMESTAMP(3);
ALTER TABLE "laundry_requests" ADD COLUMN "final_amount" DECIMAL(10,2);
