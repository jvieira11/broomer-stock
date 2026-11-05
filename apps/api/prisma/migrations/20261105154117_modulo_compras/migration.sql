-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "stock_operations" ADD COLUMN     "purchase_order_id" TEXT;

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "supplier_id" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "expected_at" DATE,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity_ordered" INTEGER NOT NULL,
    "quantity_received" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4),

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_settings" (
    "organization_id" TEXT NOT NULL,
    "analysis_days" INTEGER NOT NULL DEFAULT 90,
    "lead_time_days" INTEGER NOT NULL DEFAULT 15,
    "cover_days" INTEGER NOT NULL DEFAULT 30,
    "min_sales" INTEGER NOT NULL DEFAULT 3,
    "min_history_days" INTEGER NOT NULL DEFAULT 14,
    "excess_days" INTEGER NOT NULL DEFAULT 180,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE INDEX "purchase_orders_organization_id_status_idx" ON "purchase_orders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organization_id_number_key" ON "purchase_orders"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organization_id_idempotency_key_key" ON "purchase_orders"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_order_items_variant_id_idx" ON "purchase_order_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_order_id_variant_id_key" ON "purchase_order_items"("order_id", "variant_id");

-- CreateIndex
CREATE INDEX "stock_operations_purchase_order_id_idx" ON "stock_operations"("purchase_order_id");

-- AddForeignKey
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_settings" ADD CONSTRAINT "purchase_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integridade no próprio banco: quantidades coerentes e parâmetros dentro de limites.
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_quantities_check"
  CHECK ("quantity_ordered" > 0 AND "quantity_received" >= 0 AND "quantity_received" <= "quantity_ordered");
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_cost_check"
  CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);
ALTER TABLE "purchase_settings" ADD CONSTRAINT "purchase_settings_ranges_check"
  CHECK ("analysis_days" BETWEEN 7 AND 366 AND "lead_time_days" BETWEEN 0 AND 180
     AND "cover_days" BETWEEN 1 AND 365 AND "min_sales" BETWEEN 1 AND 100
     AND "min_history_days" BETWEEN 1 AND 366 AND "excess_days" BETWEEN 30 AND 1095);
