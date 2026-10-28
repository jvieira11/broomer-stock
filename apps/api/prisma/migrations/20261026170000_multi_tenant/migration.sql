-- Multiempresa, usuários, quantidades decimais e custo médio.
-- Ajustada à mão para preservar dados existentes: eles passam a pertencer
-- à organização "Empresa padrão" (criada só se houver dados).

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Organização para os dados já existentes
INSERT INTO "organizations" ("id", "name", "updated_at")
SELECT '00000000-0000-4000-8000-000000000001', 'Empresa padrão', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "categories")
   OR EXISTS (SELECT 1 FROM "products");

-- DropIndex (unicidade passa a ser por organização)
DROP INDEX "categories_name_key";
DROP INDEX "products_sku_key";

-- categories
ALTER TABLE "categories" ADD COLUMN "organization_id" TEXT;
UPDATE "categories" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "categories" ALTER COLUMN "organization_id" SET NOT NULL;

-- products: custo vira custo médio (mantendo o valor) e quantidades ficam decimais
ALTER TABLE "products" ADD COLUMN "organization_id" TEXT;
UPDATE "products" SET "organization_id" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "products" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "products" RENAME COLUMN "cost_price" TO "average_cost";
ALTER TABLE "products"
  ALTER COLUMN "average_cost" SET DATA TYPE DECIMAL(14,4),
  ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3),
  ALTER COLUMN "quantity" SET DEFAULT 0,
  ALTER COLUMN "min_quantity" SET DATA TYPE DECIMAL(14,3),
  ALTER COLUMN "min_quantity" SET DEFAULT 0;

-- stock_movements
ALTER TABLE "stock_movements"
  ADD COLUMN "organization_id" TEXT,
  ADD COLUMN "unit_cost" DECIMAL(14,4),
  ADD COLUMN "user_id" TEXT,
  ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3),
  ALTER COLUMN "balance_after" SET DATA TYPE DECIMAL(14,3);
UPDATE "stock_movements" m
SET "organization_id" = p."organization_id", "unit_cost" = p."average_cost"
FROM "products" p
WHERE p."id" = m."product_id";
ALTER TABLE "stock_movements"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ALTER COLUMN "unit_cost" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");
CREATE UNIQUE INDEX "categories_organization_id_name_key" ON "categories"("organization_id", "name");
CREATE INDEX "products_organization_id_name_idx" ON "products"("organization_id", "name");
CREATE UNIQUE INDEX "products_organization_id_sku_key" ON "products"("organization_id", "sku");
CREATE INDEX "stock_movements_organization_id_created_at_idx" ON "stock_movements"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
