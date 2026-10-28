-- Broomer: produto (modelo) + variações (tamanho/cor) com saldo inteiro,
-- operações que agrupam movimentações, fornecedores e categorias desativáveis.
--
-- Ajustada à mão para preservar dados:
-- * cada produto existente vira um modelo (referência = SKU antigo) com uma
--   variação sem tamanho/cor, levando o SKU, o saldo e o custo médio;
-- * movimentações antigas não têm como ser classificadas (uma saída não é
--   necessariamente uma venda), então a migration para com erro se houver
--   alguma, em vez de inventar o motivo. Bancos novos não têm nenhuma.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "stock_movements") THEN
    RAISE EXCEPTION 'Há movimentações no modelo antigo. Exporte-as e defina como classificá-las antes de aplicar esta migration.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "products"
    WHERE "quantity" <> TRUNC("quantity") OR "min_quantity" <> TRUNC("min_quantity")
  ) THEN
    RAISE EXCEPTION 'Há produtos com quantidade fracionada; o novo modelo controla peças inteiras.';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('ENTRY', 'SALE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'LOSS', 'INVENTORY', 'REVERSAL', 'INITIAL_LOAD');

-- categories: desativar em vez de excluir
ALTER TABLE "categories" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- suppliers
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- product_variants
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "sale_price" DECIMAL(10,2),
    "min_quantity" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- Uma variação por produto existente, com o SKU, o saldo e o custo dele.
INSERT INTO "product_variants"
  ("id", "organization_id", "product_id", "sku", "quantity", "average_cost", "active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "organization_id", "id", "sku", "quantity"::integer,
       "average_cost", "active", "created_at", CURRENT_TIMESTAMP
FROM "products";

-- products: vira o modelo comercial
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_fkey";
DROP INDEX "products_organization_id_sku_key";
ALTER TABLE "products" RENAME COLUMN "sku" TO "reference";
ALTER TABLE "products"
  DROP COLUMN "average_cost",
  DROP COLUMN "quantity",
  DROP COLUMN "unit",
  ADD COLUMN "collection" TEXT,
  ADD COLUMN "fit" TEXT,
  ADD COLUMN "supplier_id" TEXT,
  ALTER COLUMN "min_quantity" SET DATA TYPE INTEGER,
  ALTER COLUMN "min_quantity" SET DEFAULT 0;

-- stock_operations
CREATE TABLE "stock_operations" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "OperationType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sale_reference" TEXT,
    "origin" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "reversed_operation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_operations_pkey" PRIMARY KEY ("id")
);

-- stock_movements (vazia, conferido no início)
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_product_id_fkey";
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_user_id_fkey";
DROP INDEX "stock_movements_product_id_created_at_idx";
ALTER TABLE "stock_movements"
  DROP COLUMN "product_id",
  DROP COLUMN "reason",
  ADD COLUMN "balance_before" INTEGER NOT NULL,
  ADD COLUMN "operation_id" TEXT NOT NULL,
  ADD COLUMN "variant_id" TEXT NOT NULL,
  ALTER COLUMN "quantity" SET DATA TYPE INTEGER,
  ALTER COLUMN "balance_after" SET DATA TYPE INTEGER,
  ALTER COLUMN "user_id" SET NOT NULL;

-- Saldo nunca negativo, quantidade de movimentação nunca zero.
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_quantity_check" CHECK ("quantity" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_check" CHECK ("quantity" <> 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_balance_check"
  CHECK ("balance_after" >= 0 AND "balance_after" = "balance_before" + "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organization_id_name_key" ON "suppliers"("organization_id", "name");
CREATE INDEX "product_variants_organization_id_color_idx" ON "product_variants"("organization_id", "color");
CREATE INDEX "product_variants_organization_id_size_idx" ON "product_variants"("organization_id", "size");
CREATE UNIQUE INDEX "product_variants_organization_id_sku_key" ON "product_variants"("organization_id", "sku");
CREATE UNIQUE INDEX "product_variants_product_id_size_color_key" ON "product_variants"("product_id", "size", "color");
CREATE UNIQUE INDEX "stock_operations_number_key" ON "stock_operations"("number");
CREATE UNIQUE INDEX "stock_operations_reversed_operation_id_key" ON "stock_operations"("reversed_operation_id");
CREATE INDEX "stock_operations_organization_id_occurred_at_idx" ON "stock_operations"("organization_id", "occurred_at");
CREATE INDEX "stock_operations_organization_id_type_occurred_at_idx" ON "stock_operations"("organization_id", "type", "occurred_at");
CREATE INDEX "stock_operations_user_id_idx" ON "stock_operations"("user_id");
CREATE UNIQUE INDEX "stock_operations_organization_id_idempotency_key_key" ON "stock_operations"("organization_id", "idempotency_key");
CREATE INDEX "products_supplier_id_idx" ON "products"("supplier_id");
CREATE UNIQUE INDEX "products_organization_id_reference_key" ON "products"("organization_id", "reference");
CREATE INDEX "stock_movements_variant_id_created_at_idx" ON "stock_movements"("variant_id", "created_at");
CREATE INDEX "stock_movements_operation_id_idx" ON "stock_movements"("operation_id");
CREATE INDEX "stock_movements_user_id_idx" ON "stock_movements"("user_id");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_reversed_operation_id_fkey" FOREIGN KEY ("reversed_operation_id") REFERENCES "stock_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "stock_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
