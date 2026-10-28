import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { getMe, getProductOr404 } from "@/lib/data";
import { canEditCatalog } from "@/lib/permissions";
import type { Category, Supplier } from "@/lib/types";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditProductPage({
  params,
}: PageProps<"/produtos/[id]/editar">) {
  const { id } = await params;
  const [me, product, categories, suppliers] = await Promise.all([
    getMe(),
    getProductOr404(id),
    api.get<Category[]>("/categories"),
    api.get<Supplier[]>("/suppliers"),
  ]);
  if (!canEditCatalog(me.role)) notFound();

  return (
    <>
      <PageHeader
        eyebrow={`Ref. ${product.reference}`}
        title={`Editar ${product.name}`}
        description="As variações são editadas na página do produto. Saldo e custo só mudam por movimentações."
      />
      <Card className="max-w-5xl">
        <ProductForm product={product} categories={categories} suppliers={suppliers} />
      </Card>
    </>
  );
}
