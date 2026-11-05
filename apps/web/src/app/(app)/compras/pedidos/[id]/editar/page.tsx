import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { type OrderLine, PurchaseOrderForm } from "@/components/purchase-order-form";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { getMe, getPurchaseOrderOr404 } from "@/lib/data";
import { canEditCatalog } from "@/lib/permissions";
import type { Supplier } from "@/lib/types";

export const metadata: Metadata = { title: "Editar pedido de compra" };

export default async function EditPurchaseOrderPage({
  params,
}: PageProps<"/compras/pedidos/[id]/editar">) {
  const { id } = await params;
  const [me, order, suppliers] = await Promise.all([
    getMe(),
    getPurchaseOrderOr404(id),
    api.get<Supplier[]>("/suppliers"),
  ]);
  if (!canEditCatalog(me.role)) notFound();
  if (order.status !== "DRAFT" && order.status !== "PENDING") {
    redirect(`/compras/pedidos/${id}`);
  }

  const lines: OrderLine[] = order.items.map((i) => ({
    variantId: i.variantId,
    name: i.variant.product.name,
    size: i.variant.size,
    color: i.variant.color,
    sku: i.variant.sku,
    stock: i.variant.quantity,
    quantity: String(i.quantityOrdered),
    unitCost: i.unitCost ? String(Number(i.unitCost)) : "",
  }));

  return (
    <>
      <PageHeader eyebrow={`Pedido #${order.number}`} title="Editar pedido" />
      <PurchaseOrderForm
        suppliers={suppliers}
        initial={{
          id: order.id,
          supplierId: order.supplier?.id ?? "",
          notes: order.notes ?? "",
          expectedAt: order.expectedAt ? order.expectedAt.slice(0, 10) : "",
          status: order.status,
          lines,
        }}
      />
    </>
  );
}
