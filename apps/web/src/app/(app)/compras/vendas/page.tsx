import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteSalesImport } from "@/components/delete-sales-import";
import { ImportSales } from "@/components/import-sales";
import {
  Badge,
  Card,
  cellClass,
  EmptyState,
  Field,
  inputClass,
  buttonClass,
  PageHeader,
  rowClass,
  StatCard,
  Table,
} from "@/components/ui";
import { api } from "@/lib/api";
import { getMe, pickQuery } from "@/lib/data";
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import { canEditCatalog, canManageUsers } from "@/lib/permissions";
import { classificationLabels, classificationTones } from "@/lib/purchases";
import type { GroupSuggestions, SalesImportItem, SalesSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Histórico de vendas" };

const FILTERS = ["from", "to", "category"] as const;
const pct = (value: number) => `${(value * 100).toFixed(1).replace(".", ",")}%`;
const day = (iso: string) => formatDate(`${iso.slice(0, 10)}T12:00:00`);
const monthLabel = (month: string) => {
  const [year, m] = month.split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${names[Number(m) - 1]}/${year.slice(2)}`;
};

function Bars({
  rows,
  tone = "bg-ink-900",
}: {
  rows: { key: string; label: string; value: number; hint?: string; href?: string }[];
  tone?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatQuantity(row.value)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-full rounded-full ${tone}`}
                style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%` }}
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

export default async function SalesHistoryPage({ searchParams }: PageProps<"/compras/vendas">) {
  const me = await getMe();
  // Traz custo, margem e vendedores: só administrador e gerente.
  if (!canEditCatalog(me.role)) notFound();

  const params = await searchParams;
  const query = pickQuery(params, FILTERS);
  const categoryQuery = new URLSearchParams();
  if (query.get("category")) categoryQuery.set("category", query.get("category") ?? "");
  const [summary, imports, groups] = await Promise.all([
    api.get<SalesSummary>(`/sales-history/summary?${query}`),
    api.get<SalesImportItem[]>("/sales-history/imports"),
    api.get<GroupSuggestions>(`/purchases/by-size?${categoryQuery}`),
  ]);
  const stockPieces = groups.items.reduce((sum, g) => sum + g.quantity, 0);
  const soldWindow = groups.items.reduce((sum, g) => sum + g.sold, 0);
  const overallCover = soldWindow > 0 ? Math.round(stockPieces / (soldWindow / groups.params.analysisDays)) : null;
  const value = (key: (typeof FILTERS)[number]) => query.get(key) ?? "";
  const t = summary.totals;
  const hasData = t.lines > 0;
  const baseHref = (extra: Record<string, string>) => {
    const next = new URLSearchParams(query);
    for (const [k, v] of Object.entries(extra)) next.set(k, v);
    return `/compras/vendas?${next}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Histórico de vendas"
        description="Vendas importadas do ERP para analisar giro, mix de tamanhos e margem. Não altera o estoque."
        action={
          <Link href="/compras" className={buttonClass.secondary}>
            Voltar às compras
          </Link>
        }
      />

      <Card
        title="Importar vendas"
        description="Relatório “vendas por cupom” exportado pelo ERP."
        className="mb-6"
      >
        <ImportSales />
      </Card>

      <Card title="Importações feitas" className="mb-6" flush>
        {imports.length === 0 ? (
          <EmptyState title="Nenhuma importação ainda">As vendas importadas aparecem aqui.</EmptyState>
        ) : (
          <Table head={["Período", "Linhas", "Peças líquidas", "Valor", "Importado", ""]}>
            {imports.map((item) => (
              <tr key={item.id} className={rowClass}>
                <td className={cellClass}>
                  {day(item.periodFrom)} a {day(item.periodTo)}
                </td>
                <td className={cellClass}>{formatQuantity(item.lineCount)}</td>
                <td className={cellClass}>{formatQuantity(item.pieces)}</td>
                <td className={cellClass}>{formatCurrency(item.total)}</td>
                <td className={`${cellClass} text-neutral-500`}>
                  {formatDateTime(item.createdAt)}
                  <span className="block text-xs">{item.user.name}</span>
                </td>
                <td className={cellClass}>
                  {canManageUsers(me.role) && (
                    <DeleteSalesImport
                      id={item.id}
                      label={`${day(item.periodFrom)} a ${day(item.periodTo)}`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {!hasData ? (
        <EmptyState title="Sem vendas para analisar">
          Importe o relatório de vendas acima para ver a análise.
        </EmptyState>
      ) : (
        <>
          <form className="mb-6 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-4 sm:items-end">
            <Field label="De" htmlFor="from">
              <input id="from" name="from" type="date" defaultValue={value("from")} className={inputClass} />
            </Field>
            <Field label="Até" htmlFor="to">
              <input id="to" name="to" type="date" defaultValue={value("to")} className={inputClass} />
            </Field>
            <Field label="Categoria" htmlFor="category">
              <select id="category" name="category" defaultValue={value("category")} className={inputClass}>
                <option value="">Todas</option>
                {summary.categories.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2">
              <button type="submit" className={`${buttonClass.primary} flex-1`}>
                Filtrar
              </button>
              <Link href="/compras/vendas" className={buttonClass.ghost}>
                Limpar
              </Link>
            </div>
          </form>

          {summary.coverage.first && summary.coverage.last && (
            <p className="mb-4 text-sm text-neutral-600">
              Vendas de {day(summary.coverage.first)} a {day(summary.coverage.last)}
              {summary.category && (
                <>
                  {" "}
                  · categoria <Badge tone="dark">{summary.category}</Badge>
                </>
              )}
            </p>
          )}

          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard label="Peças líquidas" value={formatQuantity(t.netPieces)} hint={`${formatQuantity(t.soldPieces)} vendidas`} />
            <StatCard label="Devoluções" value={formatQuantity(t.returnedPieces)} hint={formatCurrency(t.returnsValue)} />
            <StatCard label="Faturamento" value={formatCurrency(t.revenue)} hint="líquido de devoluções" />
            <StatCard label="Desconto" value={pct(t.discountRate)} hint={`${formatCurrency(t.discount)} concedidos`} />
            <StatCard label="Margem" value={pct(t.marginRate)} hint={formatCurrency(t.margin)} tone="success" />
            <StatCard label="Custo" value={formatCurrency(t.cost)} hint="das peças vendidas" />
          </div>

          <Card
            title="Reposição por categoria e tamanho"
            description={`Estoque atual × vendas dos últimos ${groups.params.analysisDays} dias${groups.referenceDate ? ` até ${day(groups.referenceDate)}` : ""}. Diz quantas peças de cada tamanho comprar, por categoria; não diz qual modelo ou cor.`}
            className="mb-6"
            flush
          >
            <div className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-600">
              {overallCover !== null && (
                <p>
                  {formatQuantity(stockPieces)} peças em estoque{summary.category ? ` (${summary.category})` : ""}; no ritmo
                  das vendas, duram cerca de <strong>{formatQuantity(overallCover)} dias</strong>.{" "}
                  {groups.totalSuggested === 0
                    ? "Nenhuma compra sugerida: o estoque cobre as vendas."
                    : `${formatQuantity(groups.totalSuggested ?? 0)} peça(s) sugeridas no total.`}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(classificationLabels) as (keyof typeof classificationLabels)[])
                  .filter((c) => (groups.counts?.[c] ?? 0) > 0)
                  .map((c) => (
                    <Badge key={c} tone={classificationTones[c]}>
                      {classificationLabels[c]} · {groups.counts?.[c]}
                    </Badge>
                  ))}
              </div>
            </div>
            {groups.items.length === 0 ? (
              <EmptyState title="Nada para mostrar">Sem estoque nem vendas nessa categoria.</EmptyState>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto">
                <Table head={["Categoria", "Tamanho", "Estoque", "Vendidas", "Dura (dias)", "Sugerido", "Situação"]}>
                  {groups.items.slice(0, 60).map((g) => (
                    <tr key={`${g.category}-${g.size}`} className={rowClass}>
                      <td className={cellClass}>
                        {g.category}
                        <details className="text-xs text-neutral-500">
                          <summary className="cursor-pointer select-none hover:text-ink-900">Por quê?</summary>
                          <p className="mt-1 max-w-sm whitespace-normal leading-relaxed">{g.reason}</p>
                        </details>
                      </td>
                      <td className={cellClass}>{g.size || "único"}</td>
                      <td className={`${cellClass} font-semibold`}>{g.quantity}</td>
                      <td className={cellClass}>{g.sold}</td>
                      <td className={`${cellClass} text-neutral-500`}>
                        {g.coverageDays !== null ? formatQuantity(Math.round(g.coverageDays)) : "—"}
                      </td>
                      <td className={cellClass}>
                        {g.suggested === null ? (
                          <span className="text-xs text-neutral-500">sem dados</span>
                        ) : (
                          <span className={g.suggested > 0 ? "font-bold" : "text-neutral-400"}>{g.suggested}</span>
                        )}
                      </td>
                      <td className={cellClass}>
                        <Badge tone={classificationTones[g.classification]}>
                          {classificationLabels[g.classification]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Card title="Peças vendidas por mês" description="Líquido de devoluções">
              <Bars
                rows={summary.months.map((m) => ({
                  key: m.month,
                  label: monthLabel(m.month),
                  value: m.pieces,
                  hint: formatCurrency(m.revenue),
                }))}
              />
            </Card>
            <Card
              title="Por categoria"
              description="Clique para ver os tamanhos e os produtos só dessa categoria"
            >
              <Bars
                tone="bg-ink-700"
                rows={summary.categories.map((c) => ({
                  key: c.category,
                  label: c.category,
                  value: c.pieces,
                  hint: `${formatCurrency(c.revenue)} · margem ${formatCurrency(c.margin)}`,
                  href: baseHref({ category: c.category }),
                }))}
              />
            </Card>
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-3">
            <Card
              title="Tamanhos mais vendidos"
              description={summary.category ? `Categoria ${summary.category}` : "Todas as categorias"}
            >
              <Bars
                tone="bg-amber-500"
                rows={summary.sizes.slice(0, 12).map((s) => ({
                  key: s.size || "unico",
                  label: s.size && s.size !== "DV" ? s.size : "Tamanho único",
                  value: s.pieces,
                }))}
              />
            </Card>
            <Card title="Produtos mais vendidos" description="Pela descrição do relatório (cortada)" className="lg:col-span-2" flush>
              <Table head={["Produto", "Peças", "Faturamento"]}>
                {summary.products.map((p) => (
                  <tr key={p.description} className={rowClass}>
                    <td className={`${cellClass} max-w-80 truncate`}>{p.description}</td>
                    <td className={`${cellClass} font-semibold`}>{p.pieces}</td>
                    <td className={cellClass}>{formatCurrency(p.revenue)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>

          <Card title="Por vendedor" className="mb-6" flush>
            <Table head={["Vendedor", "Peças líquidas", "Faturamento"]}>
              {summary.sellers.map((s) => (
                <tr key={s.seller} className={rowClass}>
                  <td className={cellClass}>{s.seller}</td>
                  <td className={cellClass}>{formatQuantity(s.pieces)}</td>
                  <td className={cellClass}>{formatCurrency(s.revenue)}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            O relatório de vendas atual não traz o código nem a cor do produto, e a descrição vem cortada.
            Por isso a análise é por categoria, tamanho e descrição, e as vendas não são ligadas a SKUs nem
            entram nas sugestões de compra por variação: a reposição acima é por categoria e tamanho.
          </p>
        </>
      )}
    </>
  );
}
