import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { getMe } from "@/lib/data";
import { canEditCatalog } from "@/lib/permissions";
import type { Category, Supplier } from "@/lib/types";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const [me, categories, suppliers] = await Promise.all([
    getMe(),
    api.get<Category[]>("/categories"),
    api.get<Supplier[]>("/suppliers"),
  ]);
  if (!canEditCatalog(me.role)) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Produtos"
        title="Novo produto"
        description="Cadastre o modelo e gere as combinações de tamanho e cor."
      />
      <Card className="max-w-5xl">
        <ProductForm categories={categories} suppliers={suppliers} />
      </Card>
    </>
  );
}
