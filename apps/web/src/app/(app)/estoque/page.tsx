import { Boxes, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  buttonClass,
  Card,
  cellClass,
  EmptyState,
  Field,
  FilterBar,
  inputClass,
  PageHeader,
  Pagination,
  rowClass,
  StatusBadge,
  Table,
} from "@/components/ui";
import { api } from "@/lib/api";
import { getMe, pickQuery } from "@/lib/data";
import { formatCurrency, formatDateTime, formatQuantity } from "@/lib/format";
import { canMoveStock } from "@/lib/permissions";
import type { Category, Page, StockItem } from "@/lib/types";

export const metadata: Metadata = { title: "Estoque" };

const FILTERS = [
  "search",
  "categoryId",
  "size",
  "color",
  "status",
  "sort",
  "page",
] as const;

export default async function StockPage({ searchParams }: PageProps<"/estoque">) {
  const params = await searchParams;
  const query = pickQuery(params, FILTERS);
  const [me, stock, categories, attributes] = await Promise.all([
    getMe(),
    api.get<Page<StockItem>>(`/variants?${query}`),
    api.get<Category[]>("/categories"),
    api.get<{ sizes: string[]; colors: string[] }>("/variants/attributes"),
  ]);
  const value = (key: (typeof FILTERS)[number]) => query.get(key) ?? "";
  const filtered = [...query.keys()].some((k) => k !== "page" && k !== "sort");
  const pieces = stock.items.reduce((sum, v) => sum + v.quantity, 0);

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Saldo de cada SKU (combinação de tamanho e cor) dos produtos ativos."
        action={
          canMoveStock(me.role) && (
            <Link href="/movimentacoes/nova" className={buttonClass.primary}>
              Registrar movimentação
            </Link>
          )
        }
      />

      <Card flush>
        <FilterBar clearHref="/estoque">
          <Field label="Buscar" htmlFor="search" className="lg:col-span-2">
            <input
              id="search"
              name="search"
              defaultValue={value("search")}
              placeholder="Nome, referência ou SKU"
              className={inputClass}
            />
          </Field>
          <Field label="Categoria" htmlFor="categoryId">
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={value("categoryId")}
              className={inputClass}
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (inativa)"}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tamanho" htmlFor="size">
              <select id="size" name="size" defaultValue={value("size")} className={inputClass}>
                <option value="">Todos</option>
                {attributes.sizes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Cor" htmlFor="color">
              <select id="color" name="color" defaultValue={value("color")} className={inputClass}>
                <option value="">Todas</option>
                {attributes.colors.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Situação" htmlFor="status">
              <select id="status" name="status" defaultValue={value("status")} className={inputClass}>
                <option value="">Todas</option>
                <option value="NORMAL">Normal</option>
                <option value="LOW">Baixo</option>
                <option value="OUT">Zerado</option>
              </select>
            </Field>
            <Field label="Ordenar" htmlFor="sort">
              <select id="sort" name="sort" defaultValue={value("sort")} className={inputClass}>
                <option value="name">Nome</option>
                <option value="quantity">Menor saldo</option>
                <option value="recent">Movimentação recente</option>
              </select>
            </Field>
          </div>
        </FilterBar>

        {stock.total === 0 ? (
          <EmptyState icon={<Boxes size={22} />} title={filtered ? "Nada encontrado" : "Nenhum SKU ativo"}>
            {filtered
              ? "Nenhum SKU corresponde aos filtros."
              : "Cadastre produtos com suas variações de tamanho e cor para controlar o estoque."}
          </EmptyState>
        ) : (
          <>
            <div className="border-b border-stone-100 px-4 py-2 text-xs text-stone-500">
              {stock.total} SKU(s) · {formatQuantity(pieces)} peça(s) nesta página
            </div>
            <Table
              head={[
                "Produto",
                "Categoria",
                "Tamanho",
                "Cor",
                "SKU",
                "Saldo",
                "Mínimo",
                "Situação",
                "Preço",
                "Última mov.",
                "",
              ]}
            >
              {stock.items.map((v) => (
                <tr key={v.id} className={rowClass}>
                  <td className={`${cellClass} max-w-64`}>
                    <Link href={`/produtos/${v.product.id}`} className="block truncate font-medium hover:underline">
                      {v.product.name}
                    </Link>
                    <span className="text-xs text-stone-400">Ref. {v.product.reference}</span>
                  </td>
                  <td className={`${cellClass} text-stone-500`}>
                    {v.product.category?.name ?? "—"}
                  </td>
                  <td className={cellClass}>{v.size || "—"}</td>
                  <td className={cellClass}>{v.color || "—"}</td>
                  <td className={`${cellClass} font-mono text-xs text-stone-500`}>{v.sku}</td>
                  <td className={`${cellClass} text-base font-bold`}>{v.quantity}</td>
                  <td className={`${cellClass} text-stone-500`}>{v.minQuantity || "—"}</td>
                  <td className={cellClass}>
                    <StatusBadge status={v.status} />
                  </td>
                  <td className={cellClass}>{formatCurrency(v.salePrice)}</td>
                  <td className={`${cellClass} text-xs text-stone-500`}>
                    {v.lastMovementAt ? formatDateTime(v.lastMovementAt) : "—"}
                  </td>
                  <td className={cellClass}>
                    <Link
                      href={`/movimentacoes?variantId=${v.id}`}
                      title="Histórico deste SKU"
                      className="inline-flex rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-ink-900"
                    >
                      <History size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={stock.page}
              pageSize={stock.pageSize}
              total={stock.total}
              basePath="/estoque"
              params={query}
            />
          </>
        )}
      </Card>
    </>
  );
}
