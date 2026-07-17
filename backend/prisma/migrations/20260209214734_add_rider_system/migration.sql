/*
  Warnings:

  - The values [accepted,in_process] on the enum `RequestStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "RiderStatus" AS ENUM ('online', 'offline', 'busy');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('pending', 'assigned', 'accepted', 'rejected', 'in_transit', 'picked_up', 'delivered_to_laundry', 'cancelled');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'ORDER_CANCELLED', 'ORDER_DELETED', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_STATUS_CHANGED', 'PRICING_UPDATED', 'SETTING_UPDATED', 'REVIEW_SUBMITTED', 'REVIEW_DELETED', 'PAYMENT_PROCESSED', 'REFUND_ISSUED');

-- AlterEnum
BEGIN;
CREATE TYPE "RequestStatus_new" AS ENUM ('pending', 'picked_up', 'washing', 'ready', 'delivered', 'cancelled');
ALTER TABLE "laundry_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "laundry_requests" ALTER COLUMN "status" TYPE "RequestStatus_new" USING ("status"::text::"RequestStatus_new");
ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";
DROP TYPE "RequestStatus_old";
ALTER TABLE "laundry_requests" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- AlterEnum
ALTER TYPE "UserType" ADD VALUE 'rider';

-- AlterTable
ALTER TABLE "laundry_requests" ADD COLUMN     "estimated_completion" TIMESTAMP(3),
ADD COLUMN     "eta_minutes" INTEGER,
ADD COLUMN     "laundromat_latitude" DOUBLE PRECISION,
ADD COLUMN     "laundromat_longitude" DOUBLE PRECISION,
ADD COLUMN     "pickup_latitude" DOUBLE PRECISION,
ADD COLUMN     "pickup_longitude" DOUBLE PRECISION,
ADD COLUMN     "pickup_status" "PickupStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avg_rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "business_hours" VARCHAR(100),
ADD COLUMN     "business_name" VARCHAR(150),
ADD COLUMN     "last_location_update" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "review_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rider_status" "RiderStatus",
ADD COLUMN     "total_earnings" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "total_pickups" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action_type" "AuditActionType" NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" INTEGER,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_assignments" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "rider_id" INTEGER NOT NULL,
    "status" "PickupStatus" NOT NULL DEFAULT 'assigned',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "picked_up_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "rider_earnings" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "distance_km" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_id_key" ON "reviews"("order_id");

-- CreateIndex
CREATE INDEX "reviews_provider_id_idx" ON "reviews"("provider_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_type_idx" ON "audit_logs"("action_type");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rider_assignments_order_id_key" ON "rider_assignments"("order_id");

-- CreateIndex
CREATE INDEX "rider_assignments_rider_id_idx" ON "rider_assignments"("rider_id");

-- CreateIndex
CREATE INDEX "rider_assignments_status_idx" ON "rider_assignments"("status");

-- CreateIndex
CREATE INDEX "rider_assignments_assigned_at_idx" ON "rider_assignments"("assigned_at");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "laundry_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_assignments" ADD CONSTRAINT "rider_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "laundry_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_assignments" ADD CONSTRAINT "rider_assignments_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
