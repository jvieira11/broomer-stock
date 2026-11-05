import { PackageSearch, Plus } from "lucide-react";
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
import { formatDate, formatDateTime } from "@/lib/format";
import { canEditCatalog } from "@/lib/permissions";
import { purchaseStatusLabels, purchaseStatusTones } from "@/lib/purchases";
import type { Page, PurchaseOrderListItem, PurchaseStatus, Supplier } from "@/lib/types";

export const metadata: Metadata = { title: "Pedidos de compra" };

const FILTERS = ["search", "status", "supplierId", "open", "page"] as const;

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/compras/pedidos">) {
  const params = await searchParams;
  const query = pickQuery(params, FILTERS);
  const [me, orders, suppliers] = await Promise.all([
    getMe(),
    api.get<Page<PurchaseOrderListItem>>(`/purchase-orders?${query}`),
    api.get<Supplier[]>("/suppliers"),
  ]);
  const value = (key: (typeof FILTERS)[number]) => query.get(key) ?? "";
  const filtered = [...query.keys()].some((k) => k !== "page");
  const statuses = Object.keys(purchaseStatusLabels) as PurchaseStatus[];

  return (
    <>
      <PageHeader
        title="Pedidos de compra"
        description="Acompanhe o que foi pedido e o que já chegou. O estoque só sobe no recebimento."
        action={
          canEditCatalog(me.role) && (
            <Link href="/compras/pedidos/novo" className={buttonClass.primary}>
              <Plus size={16} /> Novo pedido
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/compras/pedidos" className="rounded-full">
          <Badge tone={!filtered ? "dark" : "neutral"}>Todos</Badge>
        </Link>
        <Link href="/compras/pedidos?open=true" className="rounded-full">
          <Badge tone={value("open") === "true" ? "dark" : "neutral"}>Em aberto</Badge>
        </Link>
        {statuses.map((s) => (
          <Link key={s} href={`/compras/pedidos?status=${s}`} className="rounded-full">
            <Badge tone={value("status") === s ? "dark" : purchaseStatusTones[s]}>
              {purchaseStatusLabels[s]}
            </Badge>
          </Link>
        ))}
      </div>

      <Card flush>
        <FilterBar clearHref="/compras/pedidos">
          <Field label="Buscar" htmlFor="search" className="lg:col-span-2">
            <input
              id="search"
              name="search"
              defaultValue={value("search")}
              placeholder="Número, fornecedor ou observação"
              className={inputClass}
            />
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
          {value("status") && <input type="hidden" name="status" value={value("status")} />}
          {value("open") && <input type="hidden" name="open" value={value("open")} />}
        </FilterBar>

        {orders.total === 0 ? (
          <EmptyState
            icon={<PackageSearch size={22} />}
            title={filtered ? "Nada encontrado" : "Nenhum pedido ainda"}
          >
            {filtered
              ? "Nenhum pedido corresponde aos filtros."
              : "Crie um pedido a partir das sugestões de compra ou manualmente."}
          </EmptyState>
        ) : (
          <>
            <Table head={["Pedido", "Fornecedor", "Status", "Itens", "Recebido", "Previsão", "Criado"]}>
              {orders.items.map((o) => (
                <tr key={o.id} className={rowClass}>
                  <td className={cellClass}>
                    <Link href={`/compras/pedidos/${o.id}`} className="font-semibold hover:underline">
                      #{o.number}
                    </Link>
                  </td>
                  <td className={`${cellClass} max-w-56 truncate`}>{o.supplier?.name ?? "—"}</td>
                  <td className={cellClass}>
                    <Badge tone={purchaseStatusTones[o.status]}>{purchaseStatusLabels[o.status]}</Badge>
                  </td>
                  <td className={cellClass}>
                    {o.itemCount} ({o.piecesOrdered} peças)
                  </td>
                  <td className={cellClass}>
                    {o.piecesReceived} / {o.piecesOrdered}
                  </td>
                  <td className={`${cellClass} text-neutral-500`}>
                    {o.expectedAt ? formatDate(o.expectedAt) : "—"}
                  </td>
                  <td className={`${cellClass} text-neutral-500`}>
                    {formatDateTime(o.createdAt)}
                    <span className="block text-xs">{o.user.name}</span>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={orders.page}
              pageSize={orders.pageSize}
              total={orders.total}
              basePath="/compras/pedidos"
              params={query}
            />
          </>
        )}
      </Card>
    </>
  );
}
