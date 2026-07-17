-- Per-rider delivery declines (auto-requeue to other riders).
CREATE TABLE "delivery_declines" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "rider_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_declines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_declines_order_id_rider_id_key" ON "delivery_declines"("order_id", "rider_id");
CREATE INDEX "delivery_declines_rider_id_idx" ON "delivery_declines"("rider_id");

ALTER TABLE "delivery_declines"
  ADD CONSTRAINT "delivery_declines_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "laundry_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_declines"
  ADD CONSTRAINT "delivery_declines_rider_id_fkey"
  FOREIGN KEY ("rider_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
