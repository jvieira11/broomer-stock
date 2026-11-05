import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { getMe } from "@/lib/data";
import { canEditCatalog } from "@/lib/permissions";
import type { Supplier } from "@/lib/types";

export const metadata: Metadata = { title: "Novo pedido de compra" };

export default async function NewPurchaseOrderPage() {
  const me = await getMe();
  if (!canEditCatalog(me.role)) notFound();
  const suppliers = await api.get<Supplier[]>("/suppliers");
  return (
    <>
      <PageHeader
        title="Novo pedido de compra"
        description="Monte o pedido manualmente. Para partir das sugestões, use a tela Sugestões."
      />
      <PurchaseOrderForm suppliers={suppliers} />
    </>
  );
}
