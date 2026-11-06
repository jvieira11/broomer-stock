import type { Metadata } from "next";
import Link from "next/link";
import { OrderActions } from "@/components/order-actions";
import { ReceiveForm } from "@/components/receive-form";
import {
  Badge,
  Card,
  cellClass,
  linkClass,
  PageHeader,
  rowClass,
  Table,
} from "@/components/ui";
import { getMe, getPurchaseOrderOr404 } from "@/lib/data";
import { formatDate, formatDateTime, formatUnitCost, variantLabel } from "@/lib/format";
import { canEditCatalog, canMoveStock } from "@/lib/permissions";
import { OPEN_STATUSES, purchaseStatusLabels, purchaseStatusTones } from "@/lib/purchases";

export const metadata: Metadata = { title: "Pedido de compra" };

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm">{children || "—"}</dd>
    </div>
  );
}

export default async function PurchaseOrderPage({ params }: PageProps<"/compras/pedidos/[id]">) {
  const { id } = await params;
  const [me, order] = await Promise.all([getMe(), getPurchaseOrderOr404(id)]);
  const ordered = order.items.reduce((s, i) => s + i.quantityOrdered, 0);
  const received = order.items.reduce((s, i) => s + i.quantityReceived, 0);
  const canReceive = canMoveStock(me.role) && OPEN_STATUSES.includes(order.status);

  return (
    <>
      <PageHeader
        eyebrow={`Pedido #${order.number}`}
        title={order.supplier?.name ?? "Sem fornecedor"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={purchaseStatusTones[order.status]}>{purchaseStatusLabels[order.status]}</Badge>
            {received} de {ordered} peça(s) recebidas
          </span>
        }
        action={<OrderActions id={order.id} status={order.status} canManage={canEditCatalog(me.role)} />}
      />

      {order.status === "DRAFT" && (
        <p className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          Rascunho: ainda não conta como peças a caminho nas sugestões. Confirme o pedido quando estiver pronto.
        </p>
      )}

      <div className="mb-6 grid gap-6 2xl:grid-cols-3">
        <Card title="Dados" className="2xl:col-span-1">
          <dl className="grid gap-4">
            <Info label="Fornecedor">{order.supplier?.name}</Info>
            <Info label="Previsão de chegada">{order.expectedAt ? formatDate(order.expectedAt) : ""}</Info>
            <Info label="Criado">
              {formatDateTime(order.createdAt)} por {order.user.name}
            </Info>
            {order.sentAt && <Info label="Enviado ao fornecedor">{formatDateTime(order.sentAt)}</Info>}
            {order.cancelledAt && <Info label="Cancelado em">{formatDateTime(order.cancelledAt)}</Info>}
            <Info label="Observações">{order.notes}</Info>
          </dl>
        </Card>
        <Card title="Itens do pedido" className="2xl:col-span-2" flush>
          <Table head={["Produto", "Variação", "Pedido", "Recebido", "Falta", "Custo un."]}>
            {order.items.map((i) => {
              const missing = i.quantityOrdered - i.quantityReceived;
              return (
                <tr key={i.id} className={rowClass}>
                  <td className={`${cellClass} max-w-56 truncate`}>
                    <Link href={`/produtos/${i.variant.product.id}`} className="font-medium hover:underline">
                      {i.variant.product.name}
                    </Link>
                  </td>
                  <td className={cellClass}>
                    {variantLabel(i.variant)}
                    <span className="block font-mono text-[11px] text-neutral-400">{i.variant.sku}</span>
                  </td>
                  <td className={`${cellClass} font-semibold`}>{i.quantityOrdered}</td>
                  <td className={`${cellClass} text-emerald-700`}>{i.quantityReceived}</td>
                  <td className={cellClass}>{missing > 0 ? missing : "—"}</td>
                  <td className={`${cellClass} text-neutral-500`}>
                    {i.unitCost ? formatUnitCost(i.unitCost) : "—"}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>

      {canReceive && (
        <div className="mb-6">
          <ReceiveForm orderId={order.id} number={order.number} items={order.items} />
        </div>
      )}

      <Card title="Recebimentos" description="Cada recebimento é uma entrada no estoque, com histórico próprio." flush>
        {order.receipts.length === 0 ? (
          <p className="p-5 text-sm text-neutral-500">Nenhum recebimento registrado.</p>
        ) : (
          <Table head={["Entrada", "Data", "Registrado por", "Itens", ""]}>
            {order.receipts.map((r) => (
              <tr key={r.id} className={rowClass}>
                <td className={cellClass}>
                  <Link href={`/movimentacoes/${r.id}`} className={linkClass}>
                    #{r.number}
                  </Link>
                </td>
                <td className={`${cellClass} text-neutral-500`}>{formatDateTime(r.occurredAt)}</td>
                <td className={cellClass}>{r.user.name}</td>
                <td className={cellClass}>{r._count.movements}</td>
                <td className={cellClass}>{r.reversal && <Badge tone="danger">Estornada</Badge>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
