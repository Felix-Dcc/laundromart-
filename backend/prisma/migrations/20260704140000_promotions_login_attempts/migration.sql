-- Promotions + login attempt tracking (super-admin promotions & security).
CREATE TYPE "PromoType" AS ENUM ('percent', 'fixed');

CREATE TABLE "promotions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "description" TEXT,
    "type" "PromoType" NOT NULL DEFAULT 'percent',
    "value" DECIMAL(10,2) NOT NULL,
    "min_order" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");
CREATE INDEX "promotions_active_idx" ON "promotions"("active");

CREATE TABLE "login_attempts" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "user_id" INTEGER,
    "success" BOOLEAN NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_attempts_email_idx" ON "login_attempts"("email");
CREATE INDEX "login_attempts_success_idx" ON "login_attempts"("success");
CREATE INDEX "login_attempts_created_at_idx" ON "login_attempts"("created_at");
