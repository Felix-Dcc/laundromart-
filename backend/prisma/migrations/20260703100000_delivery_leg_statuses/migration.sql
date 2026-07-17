-- Granular delivery-leg statuses (added at the end of the enum; display order
-- is defined by the MAINLINE array in code, not enum ordinal).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'rider_to_laundromat';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'collected_from_laundromat';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'rider_arrived_at_customer';
