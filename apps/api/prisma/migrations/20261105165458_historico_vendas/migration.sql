-- CreateTable
CREATE TABLE "sales_imports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "store" TEXT,
    "line_count" INTEGER NOT NULL,
    "pieces" INTEGER NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "sold_on" DATE NOT NULL,
    "seller" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "size" TEXT NOT NULL DEFAULT '',
    "code" TEXT,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "returned" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "is_return" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_imports_organization_id_period_from_period_to_idx" ON "sales_imports"("organization_id", "period_from", "period_to");

-- CreateIndex
CREATE UNIQUE INDEX "sales_imports_organization_id_file_hash_key" ON "sales_imports"("organization_id", "file_hash");

-- CreateIndex
CREATE INDEX "sale_lines_organization_id_sold_on_idx" ON "sale_lines"("organization_id", "sold_on");

-- CreateIndex
CREATE INDEX "sale_lines_import_id_idx" ON "sale_lines"("import_id");

-- AddForeignKey
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "sales_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integridade: quantidade não nula; preço e devolução não negativos. O desconto
-- pode ser negativo em linhas de devolução (estorna o desconto da venda).
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_values_check"
  CHECK ("quantity" <> 0 AND "unit_price" >= 0 AND "returned" >= 0
     AND ("discount" >= 0 OR "is_return"));
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_period_check"
  CHECK ("period_from" <= "period_to");
