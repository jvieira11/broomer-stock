import {
  AlertTriangle,
  ClipboardList,
  Hourglass,
  PackageCheck,
  PackageX,
  Plus,
  ShoppingCart,
  Snowflake,
  TrendingUp,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  buttonClass,
  Card,
  cellClass,
  EmptyState,
  linkClass,
  PageHeader,
  rowClass,
  StatCard,
  Table,
} from "@/components/ui";
import { api } from "@/lib/api";
import { getMe } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import { canEditCatalog } from "@/lib/permissions";
import {
  classificationLabels,
  OPEN_STATUSES,
  purchaseStatusLabels,
  purchaseStatusTones,
} from "@/lib/purchases";
import type { Classification, PurchaseStatus, PurchaseSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Compras" };

// Barras horizontais simples (sem biblioteca), cada uma pode levar a uma lista.
function Bars({
  rows,
  unit = "",
  tone = "bg-ink-900",
}: {
  rows: { key: string; label: string; value: number; href?: string; hint?: string }[];
  unit?: string;
  tone?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatQuantity(row.value)}
                {unit}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-full rounded-full ${tone}`}
                style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 3 : 0)}%` }}
              />
            </div>
            {row.hint && <p className="mt-0.5 text-xs text-neutral-500">{row.hint}</p>}
          </>
        );
        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className="block rounded-md hover:bg-neutral-50">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

const CLASS_BARS: { key: Classification; tone: string }[] = [
  { key: "CRITICAL", tone: "bg-red-600" },
  { key: "REPLENISH", tone: "bg-amber-500" },
  { key: "BELOW_MIN", tone: "bg-amber-400" },
  { key: "STALE", tone: "bg-neutral-400" },
  { key: "EXCESS", tone: "bg-sky-500" },
  { key: "INSUFFICIENT", tone: "bg-neutral-300" },
  { key: "OK", tone: "bg-emerald-500" },
];

export default async function PurchasesDashboard() {
  const [me, data] = await Promise.all([getMe(), api.get<PurchaseSummary>("/purchases/summary")]);
  const canCreate = canEditCatalog(me.role);
  const openCount = OPEN_STATUSES.reduce((s, st) => s + (data.ordersByStatus[st] ?? 0), 0);
  const totalVariants = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const lowData = totalVariants > 0 && data.counts.INSUFFICIENT + data.counts.BELOW_MIN >= totalVariants / 2;
  const statuses = Object.keys(purchaseStatusLabels) as PurchaseStatus[];

  return (
    <>
      <PageHeader
        title="Compras e reposição"
        description={`O que comprar, quanto e por quê, com base no estoque e nas vendas dos últimos ${data.params.analysisDays} dias.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/compras/sugestoes" className={buttonClass.secondary}>
              <ShoppingCart size={16} /> Ver sugestões
            </Link>
            {canCreate && (
              <Link href="/compras/vendas" className={buttonClass.secondary}>
                <TrendingUp size={16} /> Histórico de vendas
              </Link>
            )}
            {canCreate && (
              <Link href="/compras/pedidos/novo" className={buttonClass.primary}>
                <Plus size={16} /> Novo pedido
              </Link>
            )}
          </div>
        }
      />

      {lowData && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ainda há pouco histórico de vendas para a maioria dos itens. Sem {data.params.minSales} vendas em
          pelo menos {data.params.minHistoryDays} dias, o sistema não calcula a quantidade a comprar (e não
          inventa números). As sugestões melhoram conforme as vendas forem registradas.
        </p>
      )}
      {data.truncated && (
        <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A loja tem mais variações do que o limite de análise: parte delas ficou de fora destes números.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Precisam repor"
          value={data.needReplenish}
          tone={data.needReplenish > 0 ? "warning" : "default"}
          hint="variações com compra sugerida"
          href="/compras/sugestoes?onlyActionable=true"
          icon={<ShoppingCart size={18} />}
        />
        <StatCard
          label="Estoque crítico"
          value={data.counts.CRITICAL}
          tone={data.counts.CRITICAL > 0 ? "danger" : "default"}
          hint="zerado ou acaba antes do prazo"
          href="/compras/sugestoes?classification=CRITICAL"
          icon={<AlertTriangle size={18} />}
        />
        <StatCard
          label="Peças sugeridas"
          value={formatQuantity(data.totalSuggested)}
          hint={
            Number(data.estimatedCost) > 0
              ? `≈ ${formatCurrency(data.estimatedCost)} pelo custo médio${data.suggestedWithoutCost ? " (parcial)" : ""}`
              : "total para repor"
          }
          href="/compras/sugestoes?onlyActionable=true"
          icon={<ClipboardList size={18} />}
        />
        <StatCard
          label="Pedidos em aberto"
          value={openCount}
          hint="pendentes, enviados ou parciais"
          href="/compras/pedidos?open=true"
          icon={<Hourglass size={18} />}
        />
        <StatCard
          label="Aguardando receber"
          value={formatQuantity(data.awaitingPieces)}
          hint="peças a caminho"
          href="/compras/pedidos?open=true"
          icon={<PackageCheck size={18} />}
        />
        <StatCard
          label="Parados"
          value={data.counts.STALE}
          hint={`sem vendas em ${data.params.analysisDays} dias`}
          href="/compras/sugestoes?classification=STALE"
          icon={<Snowflake size={18} />}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Situação das variações" description="Clique para ver a lista correspondente.">
          <Bars
            rows={CLASS_BARS.map(({ key }) => ({
              key,
              label: classificationLabels[key],
              value: data.counts[key],
              href: `/compras/sugestoes?classification=${key}`,
            }))}
            tone="bg-ink-900"
          />
          <p className="mt-4 text-xs text-neutral-500">
            Excesso: o estoque dura mais de {data.params.excessDays} dias no ritmo atual. Sem dados: poucas vendas
            para recomendar.
          </p>
        </Card>
        <Card title="Pedidos por status">
          <Bars
            rows={statuses.map((s) => ({
              key: s,
              label: purchaseStatusLabels[s],
              value: data.ordersByStatus[s] ?? 0,
              href: `/compras/pedidos?status=${s}`,
            }))}
            tone="bg-ink-700"
          />
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title="Maior necessidade de compra" description="Peças sugeridas por modelo">
          {data.topNeed.length === 0 ? (
            <EmptyState title="Nada a repor agora">Nenhuma variação com compra sugerida.</EmptyState>
          ) : (
            <Bars
              tone="bg-amber-500"
              rows={data.topNeed.map((p) => ({
                key: p.id,
                label: p.name,
                value: p.suggested,
                href: `/compras/sugestoes?productId=${p.id}`,
                hint: `${p.variants} variação(ões)`,
              }))}
            />
          )}
        </Card>
        <Card title="Maior saída" description={`Peças vendidas em ${data.params.analysisDays} dias`}>
          {data.topSold.length === 0 ? (
            <EmptyState title="Sem vendas no período">As vendas registradas aparecem aqui.</EmptyState>
          ) : (
            <Bars
              rows={data.topSold.map((p) => ({
                key: p.id,
                label: p.name,
                value: p.sold,
                href: `/compras/sugestoes?productId=${p.id}`,
                hint: `${p.stock} em estoque`,
              }))}
            />
          )}
        </Card>
        <Card title="Baixo giro" description="Peças paradas por modelo">
          {data.topStale.length === 0 ? (
            <EmptyState title="Nada parado">Todos os itens com estoque tiveram saída.</EmptyState>
          ) : (
            <Bars
              tone="bg-neutral-400"
              rows={data.topStale.map((p) => ({
                key: p.id,
                label: p.name,
                value: p.pieces,
                href: `/compras/sugestoes?productId=${p.id}`,
              }))}
            />
          )}
        </Card>
      </div>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Card
          title="Pedidos aguardando recebimento"
          action={
            <Link href="/compras/pedidos?open=true" className={`text-xs ${linkClass}`}>
              Ver todos
            </Link>
          }
          flush
        >
          {data.openOrders.length === 0 ? (
            <EmptyState icon={<PackageX size={22} />} title="Nenhum pedido em aberto">
              Pedidos pendentes, enviados ou parcialmente recebidos aparecem aqui.
            </EmptyState>
          ) : (
            <Table head={["Pedido", "Fornecedor", "Previsão", "A receber", "Status"]}>
              {data.openOrders.map((o) => (
                <tr key={o.id} className={rowClass}>
                  <td className={cellClass}>
                    <Link href={`/compras/pedidos/${o.id}`} className="font-medium hover:underline">
                      #{o.number}
                    </Link>
                  </td>
                  <td className={`${cellClass} max-w-48 truncate`}>{o.supplier?.name ?? "—"}</td>
                  <td className={cellClass}>{o.expectedAt ? formatDate(o.expectedAt) : "—"}</td>
                  <td className={`${cellClass} font-semibold`}>{o.piecesPending}</td>
                  <td className={cellClass}>
                    <Badge tone={purchaseStatusTones[o.status]}>{purchaseStatusLabels[o.status]}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card
          title="Entradas de mercadoria recentes"
          action={
            <Link href="/movimentacoes?type=ENTRY" className={`text-xs ${linkClass}`}>
              Ver histórico
            </Link>
          }
          flush
        >
          {data.recentEntries.length === 0 ? (
            <EmptyState title="Nenhuma entrada ainda">As entradas registradas aparecem aqui.</EmptyState>
          ) : (
            <Table head={["Operação", "Data", "Origem", "Peças"]}>
              {data.recentEntries.map((e) => (
                <tr key={e.id} className={rowClass}>
                  <td className={cellClass}>
                    <Link href={`/movimentacoes/${e.id}`} className="font-medium hover:underline">
                      #{e.number}
                    </Link>
                    {e.reversal && <span className="ml-2"><Badge tone="danger">Estornada</Badge></span>}
                  </td>
                  <td className={`${cellClass} text-neutral-500`}>{formatDateTime(e.occurredAt)}</td>
                  <td className={`${cellClass} max-w-56 truncate text-neutral-600`}>
                    {e.purchaseOrder ? (
                      <Link href={`/compras/pedidos/${e.purchaseOrder.id}`} className="hover:underline">
                        Pedido #{e.purchaseOrder.number}
                      </Link>
                    ) : (
                      (e.origin ?? "Entrada manual")
                    )}
                  </td>
                  <td className={`${cellClass} font-semibold text-emerald-700`}>+{e.pieces}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
