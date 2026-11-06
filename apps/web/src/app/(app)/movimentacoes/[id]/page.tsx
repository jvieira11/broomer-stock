import type { Metadata } from "next";
import Link from "next/link";
import { ReverseButton } from "@/components/reverse-button";
import {
  Badge,
  Card,
  cellClass,
  linkClass,
  OperationBadge,
  PageHeader,
  rowClass,
  Table,
} from "@/components/ui";
import { getMe, getOperationOr404 } from "@/lib/data";
import {
  formatDateTime,
  formatSigned,
  formatUnitCost,
  operationLabels,
} from "@/lib/format";
import { canAdjustStock } from "@/lib/permissions";

export const metadata: Metadata = { title: "Operação" };

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm">{children || "—"}</dd>
    </div>
  );
}

export default async function OperationPage({
  params,
}: PageProps<"/movimentacoes/[id]">) {
  const { id } = await params;
  const [me, op] = await Promise.all([getMe(), getOperationOr404(id)]);
  const pieces = op.movements.reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  const canReverse = canAdjustStock(me.role) && op.type !== "REVERSAL" && !op.reversal;

  return (
    <>
      <PageHeader
        eyebrow={`Operação #${op.number}`}
        title={operationLabels[op.type]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <OperationBadge type={op.type} />
            {op.reversal && <Badge tone="danger">Estornada</Badge>}
            {pieces} peça(s) em {op.movements.length} SKU(s)
          </span>
        }
        action={canReverse ? <ReverseButton id={op.id} number={op.number} /> : undefined}
      />

      {op.reversal && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Esta operação foi estornada pela{" "}
          <Link href={`/movimentacoes/${op.reversal.id}`} className={linkClass}>
            operação #{op.reversal.number}
          </Link>
          . Os registros abaixo são mantidos para auditoria.
        </p>
      )}
      {op.reversedOperation && (
        <p className="mb-6 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
          Estorno da{" "}
          <Link href={`/movimentacoes/${op.reversedOperation.id}`} className={linkClass}>
            operação #{op.reversedOperation.number} ({operationLabels[op.reversedOperation.type].toLowerCase()})
          </Link>
          .
        </p>
      )}

      <div className="grid gap-6 2xl:grid-cols-[1fr_20rem]">
        <Card title="Itens" flush>
          <Table head={["Produto", "Variação", "SKU", "Qtd.", "Saldo antes → depois", "Custo un."]}>
            {op.movements.map((m) => (
              <tr key={m.id} className={rowClass}>
                <td className={`${cellClass} max-w-64`}>
                  <Link href={`/produtos/${m.variant.product.id}`} className="block truncate font-medium hover:underline">
                    {m.variant.product.name}
                  </Link>
                  <span className="text-xs text-neutral-400">Ref. {m.variant.product.reference}</span>
                </td>
                <td className={cellClass}>
                  {[m.variant.size, m.variant.color].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className={`${cellClass} font-mono text-xs`}>
                  <Link href={`/movimentacoes?variantId=${m.variant.id}`} className="hover:underline">
                    {m.variant.sku}
                  </Link>
                </td>
                <td className={`${cellClass} font-bold ${m.quantity > 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {formatSigned(m.quantity)}
                </td>
                <td className={cellClass}>
                  {m.balanceBefore} → <span className="font-semibold">{m.balanceAfter}</span>
                </td>
                <td className={`${cellClass} text-neutral-500`}>{formatUnitCost(m.unitCost)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Dados da operação">
          <dl className="space-y-4">
            <Info label="Data e hora">{formatDateTime(op.occurredAt)}</Info>
            <Info label="Registrada em">{formatDateTime(op.createdAt)}</Info>
            <Info label="Responsável">{op.user.name}</Info>
            {op.saleReference && <Info label="Nº da venda / cupom">{op.saleReference}</Info>}
            {op.origin && <Info label="Fornecedor / origem">{op.origin}</Info>}
            {op.purchaseOrder && (
              <Info label="Pedido de compra">
                <Link href={`/compras/pedidos/${op.purchaseOrder.id}`} className={linkClass}>
                  Pedido #{op.purchaseOrder.number}
                </Link>
              </Info>
            )}
            <Info label="Motivo">{op.reason}</Info>
            <Info label="Observações">{op.notes}</Info>
          </dl>
        </Card>
      </div>
    </>
  );
}
