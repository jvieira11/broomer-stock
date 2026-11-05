import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PurchaseSettingsForm } from "@/components/purchase-settings-form";
import { SuggestionsTable } from "@/components/suggestions-table";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  FilterBar,
  inputClass,
  PageHeader,
  Pagination,
} from "@/components/ui";
import { api } from "@/lib/api";
import { getMe, pickQuery } from "@/lib/data";
import { formatQuantity } from "@/lib/format";
import { canEditCatalog } from "@/lib/permissions";
import { classificationLabels, classificationTones } from "@/lib/purchases";
import type { Category, Classification, Supplier, SuggestionsPage } from "@/lib/types";

export const metadata: Metadata = { title: "Sugestões de compra" };

const FILTERS = [
  "search",
  "categoryId",
  "supplierId",
  "productId",
  "classification",
  "onlyActionable",
  "days",
  "page",
] as const;

const ORDER: Classification[] = [
  "CRITICAL",
  "REPLENISH",
  "BELOW_MIN",
  "STALE",
  "EXCESS",
  "INSUFFICIENT",
  "OK",
];

export default async function SuggestionsPageRoute({
  searchParams,
}: PageProps<"/compras/sugestoes">) {
  const params = await searchParams;
  const query = pickQuery(params, FILTERS);
  const [me, data, categories, suppliers] = await Promise.all([
    getMe(),
    api.get<SuggestionsPage>(`/purchases/suggestions?${query}`),
    api.get<Category[]>("/categories"),
    api.get<Supplier[]>("/suppliers"),
  ]);
  const value = (key: (typeof FILTERS)[number]) => query.get(key) ?? "";
  const filtered = [...query.keys()].some((k) => k !== "page");
  const p = data.params;

  return (
    <>
      <PageHeader
        title="Sugestões de compra"
        description="O que repor, em que quantidade e por quê. A quantidade é uma sugestão: você ajusta antes de gerar o pedido."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {ORDER.map((c) => (
          <Link
            key={c}
            href={`/compras/sugestoes?classification=${c}`}
            className={`rounded-full ring-1 ring-inset ${value("classification") === c ? "ring-ink-900" : "ring-transparent"}`}
          >
            <Badge tone={classificationTones[c]}>
              {classificationLabels[c]} · {data.counts[c]}
            </Badge>
          </Link>
        ))}
      </div>

      {data.truncated && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A loja tem mais variações do que o limite de análise: parte delas não aparece. Use os filtros.
        </p>
      )}

      <Card flush>
        <FilterBar clearHref="/compras/sugestoes">
          <Field label="Buscar" htmlFor="search" className="lg:col-span-2">
            <input
              id="search"
              name="search"
              defaultValue={value("search")}
              placeholder="Nome, referência, SKU ou cor"
              className={inputClass}
            />
          </Field>
          <Field label="Categoria" htmlFor="categoryId">
            <select id="categoryId" name="categoryId" defaultValue={value("categoryId")} className={inputClass}>
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fornecedor" htmlFor="supplierId">
            <select id="supplierId" name="supplierId" defaultValue={value("supplierId")} className={inputClass}>
              <option value="">Todos</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Situação" htmlFor="classification">
            <select
              id="classification"
              name="classification"
              defaultValue={value("classification")}
              className={inputClass}
            >
              <option value="">Todas</option>
              {ORDER.map((c) => (
                <option key={c} value={c}>
                  {classificationLabels[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Período de vendas" htmlFor="days">
            <select id="days" name="days" defaultValue={value("days")} className={inputClass}>
              <option value="">Padrão ({p.analysisDays} dias)</option>
              {[30, 60, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm lg:self-end">
            <input
              type="checkbox"
              name="onlyActionable"
              value="true"
              defaultChecked={value("onlyActionable") === "true"}
            />
            Só com compra sugerida
          </label>
          {value("productId") && <input type="hidden" name="productId" value={value("productId")} />}
        </FilterBar>

        {data.total === 0 ? (
          <EmptyState
            icon={<ShoppingCart size={22} />}
            title={filtered ? "Nada encontrado" : "Nenhuma variação ativa"}
          >
            {filtered
              ? "Nenhum item corresponde aos filtros."
              : "Cadastre produtos e registre entradas e vendas para receber sugestões."}
          </EmptyState>
        ) : (
          <>
            <div className="border-b border-neutral-100 px-4 py-2 text-xs text-neutral-500">
              {formatQuantity(data.total)} item(ns) · {formatQuantity(data.totalSuggested)} peça(s) sugeridas no total
            </div>
            <SuggestionsTable
              key={`${query}`}
              rows={data.items}
              canCreate={canEditCatalog(me.role)}
            />
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              basePath="/compras/sugestoes"
              params={query}
            />
          </>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Como a sugestão é calculada" className="lg:col-span-1">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-600">
            <li>
              <b>Ritmo</b> = peças vendidas nos últimos {p.analysisDays} dias ÷ dias observados (vendas
              estornadas não contam).
            </li>
            <li>
              <b>Meta</b> = ritmo × ({p.leadTimeDays} dias de prazo + {p.coverDays} de cobertura) + estoque mínimo.
            </li>
            <li>
              <b>Sugerido</b> = meta − estoque − peças já pedidas e a caminho.
            </li>
            <li>
              Menos de {p.minSales} vendas ou {p.minHistoryDays} dias de histórico: sem dados, o sistema não
              inventa quantidade.
            </li>
          </ol>
        </Card>
        <Card
          title="Parâmetros"
          description={
            canEditCatalog(me.role)
              ? "Ajuste ao ritmo de reposição da loja."
              : "Somente administrador e gerente alteram."
          }
          className="lg:col-span-2"
        >
          {canEditCatalog(me.role) ? (
            <PurchaseSettingsForm params={p} />
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>Janela de vendas: {p.analysisDays} dias</div>
              <div>Prazo de entrega: {p.leadTimeDays} dias</div>
              <div>Cobertura: {p.coverDays} dias</div>
              <div>Vendas mínimas: {p.minSales}</div>
              <div>Histórico mínimo: {p.minHistoryDays} dias</div>
              <div>Excesso acima de: {p.excessDays} dias</div>
            </dl>
          )}
        </Card>
      </div>
    </>
  );
}
