import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  History,
  PackageX,
  Plus,
  ShoppingBag,
  Shirt,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  buttonClass,
  Card,
  cellClass,
  EmptyState,
  linkClass,
  OperationBadge,
  PageHeader,
  rowClass,
  StatCard,
  StatusBadge,
  Table,
} from "@/components/ui";
import { api } from "@/lib/api";
import { getMe, pickQuery } from "@/lib/data";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDay,
  formatQuantity,
  localDate,
  variantLabel,
} from "@/lib/format";
import { canEditCatalog, canMoveStock } from "@/lib/permissions";
import type { DashboardSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

// Barras de entradas e saídas por dia, sem biblioteca de gráficos.
function FlowChart({ daily }: { daily: DashboardSummary["daily"] }) {
  if (daily.length === 0) {
    return (
      <EmptyState title="Sem movimentações no período">
        As entradas e saídas aparecem aqui conforme forem registradas.
      </EmptyState>
    );
  }
  const max = Math.max(...daily.flatMap((d) => [d.in, d.out]), 1);
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-ink-800" /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent-400" /> Saídas
        </span>
      </div>
      <div className="flex h-48 items-end gap-1 overflow-x-auto pb-1">
        {daily.map((d) => (
          <div
            key={d.day}
            className="flex h-full min-w-6 flex-1 flex-col justify-end"
            title={`${formatDay(d.day)}: ${d.in} entrada(s), ${d.out} saída(s)`}
          >
            <div className="flex flex-1 items-end justify-center gap-0.5">
              <div
                className="w-1/2 max-w-3 rounded-t bg-ink-800"
                style={{ height: `${(d.in / max) * 100}%` }}
              />
              <div
                className="w-1/2 max-w-3 rounded-t bg-accent-400"
                style={{ height: `${(d.out / max) * 100}%` }}
              />
            </div>
            <span className="mt-1 text-center text-[10px] text-neutral-400">
              {formatDay(d.day)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const params = await searchParams;
  const query = pickQuery(params, ["from", "to"]);
  const [me, data] = await Promise.all([
    getMe(),
    api.get<DashboardSummary>(`/dashboard?${query}`),
  ]);
  const canMove = canMoveStock(me.role);
  const canEdit = canEditCatalog(me.role);
  const empty = data.activeProducts === 0 && data.recentOperations.length === 0;

  const shortcuts = (
    <>
      {canEdit && (
        <Link href="/produtos/novo" className={buttonClass.secondary}>
          <Plus size={16} /> Cadastrar produto
        </Link>
      )}
      {canMove && (
        <>
          <Link
            href="/movimentacoes/nova?tipo=ENTRY"
            className={buttonClass.secondary}
          >
            <ArrowDownToLine size={16} /> Registrar entrada
          </Link>
          <Link href="/movimentacoes/nova?tipo=SALE" className={buttonClass.accent}>
            <ShoppingBag size={16} /> Registrar venda
          </Link>
        </>
      )}
    </>
  );

  if (empty) {
    return (
      <>
        <PageHeader title={`Olá, ${me.name.split(" ")[0]}`} eyebrow="Dashboard" />
        <Card>
          <EmptyState
            icon={<Shirt size={22} />}
            title="Nenhum produto cadastrado ainda"
            action={
              canEdit ? (
                <Link href="/produtos/novo" className={buttonClass.primary}>
                  <Plus size={16} /> Cadastrar o primeiro produto
                </Link>
              ) : undefined
            }
          >
            Comece cadastrando um modelo (ex.: camisa linho slim) com as
            combinações de tamanho e cor. Cada combinação vira um SKU com saldo
            próprio; o estoque entra pelo registro de entradas.
            {!canEdit && " Peça a um administrador para cadastrar os produtos."}
          </EmptyState>
        </Card>
      </>
    );
  }

  const periodLink = (days: number) =>
    `/dashboard?${new URLSearchParams({ from: localDate(-(days - 1)), to: localDate() })}`;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`Olá, ${me.name.split(" ")[0]}`}
        description={`Período: ${formatDate(`${data.period.from}T12:00:00`)} a ${formatDate(`${data.period.to}T12:00:00`)}`}
        action={shortcuts}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.days}
            href={periodLink(p.days)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition ${
              data.period.from === localDate(-(p.days - 1)) &&
              data.period.to === localDate()
                ? "bg-ink-900 text-white ring-ink-900"
                : "bg-white text-neutral-600 ring-neutral-300 hover:bg-neutral-100"
            }`}
          >
            Últimos {p.label}
          </Link>
        ))}
        <form className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            name="from"
            defaultValue={data.period.from}
            aria-label="De"
            className="rounded-lg border border-neutral-300 bg-white px-2 py-1"
          />
          <span className="text-neutral-400">até</span>
          <input
            type="date"
            name="to"
            defaultValue={data.period.to}
            aria-label="Até"
            className="rounded-lg border border-neutral-300 bg-white px-2 py-1"
          />
          <button type="submit" className="rounded-lg px-2 py-1 font-semibold text-ink-800 hover:bg-neutral-100">
            Aplicar
          </button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        <StatCard
          label="Modelos"
          value={formatQuantity(data.activeProducts)}
          hint="produtos ativos"
          href="/produtos"
          icon={<Shirt size={16} />}
        />
        <StatCard
          label="SKUs"
          value={formatQuantity(data.activeVariants)}
          hint="combinações tamanho/cor"
          href="/estoque"
          icon={<Boxes size={16} />}
        />
        <StatCard
          label="Peças"
          value={formatQuantity(data.totalPieces)}
          hint="unidades disponíveis"
          href="/estoque"
        />
        <StatCard
          label="Estoque baixo"
          value={formatQuantity(data.lowStockCount)}
          hint="SKUs no mínimo"
          tone={data.lowStockCount ? "warning" : "default"}
          href="/estoque?status=LOW"
          icon={<AlertTriangle size={16} />}
        />
        <StatCard
          label="Sem estoque"
          value={formatQuantity(data.outOfStockCount)}
          hint="SKUs zerados"
          tone={data.outOfStockCount ? "danger" : "default"}
          href="/estoque?status=OUT"
          icon={<PackageX size={16} />}
        />
        <StatCard
          label="Entradas"
          value={formatQuantity(data.entries)}
          hint="peças recebidas no período"
          tone="success"
          href={`/movimentacoes?type=ENTRY&from=${data.period.from}&to=${data.period.to}`}
          icon={<ArrowDownToLine size={16} />}
        />
        <StatCard
          label="Vendas"
          value={formatQuantity(data.sales)}
          hint={`peças em ${data.saleOperations} venda(s)`}
          href={`/movimentacoes?type=SALE&from=${data.period.from}&to=${data.period.to}`}
          icon={<ArrowUpFromLine size={16} />}
        />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card
          title="Entradas e saídas por dia"
          description={
            data.otherOutputs || data.reversals
              ? `${data.otherOutputs} peça(s) em perdas/devoluções e ${data.reversals} estorno(s) no período`
              : "Peças movimentadas no período"
          }
          className="xl:col-span-2"
        >
          <FlowChart daily={data.daily} />
        </Card>

        <Card title="Mais vendidos" description="Peças vendidas no período">
          {data.topProducts.length === 0 ? (
            <EmptyState title="Nenhuma venda no período" />
          ) : (
            <ol className="space-y-3">
              {data.topProducts.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-600">
                    {i + 1}
                  </span>
                  <Link
                    href={`/produtos/${p.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="text-sm font-bold tabular-nums">{p.sold}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Variações com estoque baixo ou zerado"
          action={
            <Link href="/estoque?sort=quantity" className={`text-xs ${linkClass}`}>
              Ver estoque
            </Link>
          }
          flush
        >
          {data.lowStock.length === 0 ? (
            <EmptyState title="Nenhum alerta">
              Todos os SKUs ativos estão acima do mínimo.
            </EmptyState>
          ) : (
            <Table head={["Produto", "Variação", "Saldo", "Situação"]}>
              {data.lowStock.map((v) => (
                <tr key={v.id} className={rowClass}>
                  <td className={`${cellClass} max-w-56 truncate`}>
                    <Link href={`/produtos/${v.product.id}`} className="hover:underline">
                      {v.product.name}
                    </Link>
                  </td>
                  <td className={cellClass}>{variantLabel(v)}</td>
                  <td className={`${cellClass} font-semibold`}>
                    {v.quantity}
                    {v.minQuantity > 0 && (
                      <span className="font-normal text-neutral-400"> / mín. {v.minQuantity}</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    <StatusBadge status={v.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card
          title="Últimas movimentações"
          action={
            <Link href="/movimentacoes" className={`flex items-center gap-1 text-xs ${linkClass}`}>
              <History size={13} /> Histórico
            </Link>
          }
          flush
        >
          {data.recentOperations.length === 0 ? (
            <EmptyState title="Nenhuma movimentação ainda" />
          ) : (
            <Table head={["Data", "Operação", "Itens", "Responsável"]}>
              {data.recentOperations.map((op) => (
                <tr key={op.id} className={rowClass}>
                  <td className={`${cellClass} text-neutral-500`}>
                    {formatDateTime(op.occurredAt)}
                  </td>
                  <td className={cellClass}>
                    <Link href={`/movimentacoes/${op.id}`} className="flex items-center gap-2 hover:underline">
                      <span className="text-neutral-400">#{op.number}</span>
                      <OperationBadge type={op.type} />
                    </Link>
                  </td>
                  <td className={cellClass}>{op._count?.movements ?? 0}</td>
                  <td className={cellClass}>{op.user.name}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        Valor do estoque: {formatCurrency(data.stockCostValue)} pelo custo médio ·{" "}
        {formatCurrency(data.stockSaleValue)} pelo preço de venda.
      </p>
    </>
  );
}
