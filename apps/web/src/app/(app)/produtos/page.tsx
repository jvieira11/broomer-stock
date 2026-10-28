import { Plus, Shirt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
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
  Table,
} from "@/components/ui";
import { api } from "@/lib/api";
import { getMe, pickQuery } from "@/lib/data";
import { formatCurrency, formatQuantity } from "@/lib/format";
import { canEditCatalog } from "@/lib/permissions";
import type { Category, Page, ProductListItem } from "@/lib/types";

export const metadata: Metadata = { title: "Produtos" };

const FILTERS = ["search", "categoryId", "active", "page"] as const;

export default async function ProductsPage({ searchParams }: PageProps<"/produtos">) {
  const params = await searchParams;
  const query = pickQuery(params, FILTERS);
  const [me, products, categories] = await Promise.all([
    getMe(),
    api.get<Page<ProductListItem>>(`/products?${query}`),
    api.get<Category[]>("/categories"),
  ]);
  const value = (key: (typeof FILTERS)[number]) => query.get(key) ?? "";
  const filtered = [...query.keys()].some((k) => k !== "page");
  const canEdit = canEditCatalog(me.role);

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Modelos comerciais. Cada modelo agrupa suas variações de tamanho e cor."
        action={
          canEdit && (
            <Link href="/produtos/novo" className={buttonClass.primary}>
              <Plus size={16} /> Novo produto
            </Link>
          )
        }
      />

      <Card flush>
        <FilterBar clearHref="/produtos">
          <Field label="Buscar" htmlFor="search" className="lg:col-span-3">
            <input
              id="search"
              name="search"
              defaultValue={value("search")}
              placeholder="Nome, referência ou SKU"
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
          <Field label="Situação" htmlFor="active">
            <select id="active" name="active" defaultValue={value("active")} className={inputClass}>
              <option value="">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Desativados</option>
            </select>
          </Field>
        </FilterBar>

        {products.total === 0 ? (
          <EmptyState
            icon={<Shirt size={22} />}
            title={filtered ? "Nada encontrado" : "Nenhum produto cadastrado"}
            action={
              !filtered && canEdit ? (
                <Link href="/produtos/novo" className={buttonClass.primary}>
                  <Plus size={16} /> Cadastrar produto
                </Link>
              ) : undefined
            }
          >
            {filtered
              ? "Nenhum produto corresponde aos filtros."
              : "Cadastre o primeiro modelo com suas combinações de tamanho e cor."}
          </EmptyState>
        ) : (
          <>
            <Table head={["Referência", "Produto", "Categoria", "Variações", "Peças", "Alertas", "Preço", ""]}>
              {products.items.map((p) => (
                <tr key={p.id} className={rowClass}>
                  <td className={`${cellClass} font-mono text-xs text-stone-500`}>{p.reference}</td>
                  <td className={`${cellClass} max-w-72`}>
                    <Link href={`/produtos/${p.id}`} className="block truncate font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.supplier && <span className="text-xs text-stone-400">{p.supplier.name}</span>}
                  </td>
                  <td className={`${cellClass} text-stone-500`}>{p.category?.name ?? "—"}</td>
                  <td className={cellClass}>{p.variantCount}</td>
                  <td className={`${cellClass} font-semibold`}>{formatQuantity(p.totalQuantity)}</td>
                  <td className={cellClass}>
                    <div className="flex gap-1">
                      {p.outCount > 0 && <Badge tone="danger">{p.outCount} zerado(s)</Badge>}
                      {p.lowCount > 0 && <Badge tone="warning">{p.lowCount} baixo(s)</Badge>}
                      {!p.outCount && !p.lowCount && <span className="text-stone-300">—</span>}
                    </div>
                  </td>
                  <td className={cellClass}>{formatCurrency(p.salePrice)}</td>
                  <td className={cellClass}>
                    {!p.active && <Badge>Desativado</Badge>}
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={products.page}
              pageSize={products.pageSize}
              total={products.total}
              basePath="/produtos"
              params={query}
            />
          </>
        )}
      </Card>
    </>
  );
}
