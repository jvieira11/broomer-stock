import { History, Plus } from "lucide-react";
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
  OperationBadge,
  PageHeader,
  Pagination,
  rowClass,
  Table,
} from "@/components/ui";
import { api } from "@/lib/api";
import { getMe, pickQuery } from "@/lib/data";
import {
  formatDateTime,
  formatSigned,
  operationLabels,
  variantLabel,
} from "@/lib/format";
import { canManageUsers, canMoveStock } from "@/lib/permissions";
import type { Category, Movement, OperationType, Page, User } from "@/lib/types";

export const metadata: Metadata = { title: "Histórico" };

const FILTERS = [
  "search",
  "type",
  "from",
  "to",
  "categoryId",
  "size",
  "color",
  "userId",
  "productId",
  "variantId",
  "page",
] as const;

const TYPES = Object.keys(operationLabels) as OperationType[];

export default async function HistoryPage({
  searchParams,
}: PageProps<"/movimentacoes">) {
  const params = await searchParams;
  const query = pickQuery(params, FILTERS);
  const me = await getMe();
  const [movements, categories, attributes, users] = await Promise.all([
    api.get<Page<Movement>>(`/movements?${query}`),
    api.get<Category[]>("/categories"),
    api.get<{ sizes: string[]; colors: string[] }>("/variants/attributes"),
    // A lista de usuários é só do administrador; os demais filtram pela tabela.
    canManageUsers(me.role) ? api.get<User[]>("/users") : Promise.resolve([]),
  ]);
  const value = (key: (typeof FILTERS)[number]) => query.get(key) ?? "";
  const filtered = [...query.keys()].some((k) => k !== "page");
  const scoped = query.get("variantId") || query.get("productId");
  const first = movements.items[0]?.variant;
  const csvQuery = new URLSearchParams(query);
  csvQuery.delete("page");

  return (
    <>
      <PageHeader
        title="Histórico"
        description={
          scoped && first
            ? `${first.product.name}${query.get("variantId") ? ` · ${variantLabel(first)} · SKU ${first.sku}` : ""}`
            : "Todas as entradas, saídas, ajustes e estornos, item a item."
        }
        action={
          <>
            <a href={`/movimentacoes/exportar?${csvQuery}`} className={buttonClass.secondary}>
              Exportar CSV
            </a>
            {canMoveStock(me.role) && (
              <Link href="/movimentacoes/nova" className={buttonClass.primary}>
                <Plus size={16} /> Registrar
              </Link>
            )}
          </>
        }
      />

      <Card flush>
        <FilterBar clearHref="/movimentacoes">
          {value("productId") && <input type="hidden" name="productId" value={value("productId")} />}
          {value("variantId") && <input type="hidden" name="variantId" value={value("variantId")} />}
          <Field label="Buscar" htmlFor="search" className="lg:col-span-2">
            <input
              id="search"
              name="search"
              defaultValue={value("search")}
              placeholder="Produto, referência, SKU ou nº da venda"
              className={inputClass}
            />
          </Field>
          <Field label="Tipo" htmlFor="type">
            <select id="type" name="type" defaultValue={value("type")} className={inputClass}>
              <option value="">Todos</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {operationLabels[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3 lg:col-span-2">
            <Field label="De" htmlFor="from">
              <input id="from" name="from" type="date" defaultValue={value("from")} className={inputClass} />
            </Field>
            <Field label="Até" htmlFor="to">
              <input id="to" name="to" type="date" defaultValue={value("to")} className={inputClass} />
            </Field>
          </div>
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
          {users.length > 0 && (
            <Field label="Responsável" htmlFor="userId">
              <select id="userId" name="userId" defaultValue={value("userId")} className={inputClass}>
                <option value="">Todos</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </FilterBar>

        {movements.total === 0 ? (
          <EmptyState icon={<History size={22} />} title={filtered ? "Nada encontrado" : "Nenhuma movimentação ainda"}>
            {filtered
              ? "Nenhuma movimentação corresponde aos filtros."
              : "Entradas, vendas e ajustes aparecem aqui assim que forem registrados."}
          </EmptyState>
        ) : (
          <>
            <Table
              head={[
                "Data",
                "Operação",
                "Produto",
                "Variação",
                "Qtd.",
                "Saldo",
                "Motivo / referência",
                "Responsável",
              ]}
            >
              {movements.items.map((m) => (
                <tr key={m.id} className={rowClass}>
                  <td className={`${cellClass} text-neutral-500`}>{formatDateTime(m.operation.occurredAt)}</td>
                  <td className={cellClass}>
                    <Link href={`/movimentacoes/${m.operation.id}`} className="flex items-center gap-2 hover:underline">
                      <span className="text-xs text-neutral-400">#{m.operation.number}</span>
                      <OperationBadge type={m.operation.type} />
                    </Link>
                  </td>
                  <td className={"min-w-32 max-w-56 px-3 py-3"}>
                    <Link href={`/produtos/${m.variant.product.id}`} className="block font-medium hover:underline">
                      {m.variant.product.name}
                    </Link>
                  </td>
                  <td className={cellClass}>
                    <Link href={`/movimentacoes?variantId=${m.variant.id}`} className="hover:underline">
                      {variantLabel(m.variant)}
                    </Link>
                    <span className="block font-mono text-[11px] text-neutral-400">{m.variant.sku}</span>
                  </td>
                  <td className={`${cellClass} font-bold ${m.quantity > 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {formatSigned(m.quantity)}
                  </td>
                  <td className={`${cellClass} text-neutral-500`}>
                    {m.balanceBefore} → <span className="font-semibold text-ink-900">{m.balanceAfter}</span>
                  </td>
                  <td className={"min-w-40 max-w-60 px-3 py-3 text-neutral-500"}>
                    {m.operation.saleReference && <Badge>Venda {m.operation.saleReference}</Badge>}{" "}
                    {m.operation.reason ?? m.operation.origin ?? m.operation.notes ?? ""}
                  </td>
                  <td className={cellClass}>{m.user.name}</td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={movements.page}
              pageSize={movements.pageSize}
              total={movements.total}
              basePath="/movimentacoes"
              params={query}
            />
          </>
        )}
      </Card>
    </>
  );
}
