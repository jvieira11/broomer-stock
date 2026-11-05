"use client";

import { Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  type OrderResult,
  type PurchaseItemInput,
} from "@/lib/purchase-actions";
import { searchVariants } from "@/lib/actions";
import { formatQuantity, variantLabel } from "@/lib/format";
import { NETWORK_ERROR, safeCall } from "@/lib/network";
import type { StockItem, Supplier } from "@/lib/types";
import { FormMessage } from "./form-message";
import { buttonClass, Card, Field, inputClass } from "./ui";

export interface OrderLine {
  variantId: string;
  name: string;
  size: string;
  color: string;
  sku: string;
  stock: number;
  quantity: string;
  unitCost: string;
}

const MAX_QUANTITY = 1_000_000;

export function lineFromStock(item: StockItem, quantity = 1): OrderLine {
  return {
    variantId: item.id,
    name: item.product.name,
    size: item.size,
    color: item.color,
    sku: item.sku,
    stock: item.quantity,
    quantity: String(quantity),
    unitCost: Number(item.averageCost) > 0 ? String(Number(item.averageCost)) : "",
  };
}

// Pedido de compra manual (e edição de rascunho/pendente). Criar o pedido não
// mexe no estoque: o saldo só sobe no recebimento.
export function PurchaseOrderForm({
  suppliers,
  initial,
}: {
  suppliers: Supplier[];
  initial?: {
    id: string;
    supplierId: string;
    notes: string;
    expectedAt: string;
    status: "DRAFT" | "PENDING";
    lines: OrderLine[];
  };
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [expectedAt, setExpectedAt] = useState(initial?.expectedAt ?? "");
  const [lines, setLines] = useState<OrderLine[]>(initial?.lines ?? []);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<{ term: string; items: StockItem[] }>({
    term: "",
    items: [],
  });
  const [error, setError] = useState("");
  // Uma chave por pedido novo: reenviar (duplo clique) não cria dois.
  const [key] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  const term = search.trim();
  const results = term.length >= 2 && found.term === term ? found.items : [];
  const searching = term.length >= 2 && found.term !== term;

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const items = await searchVariants(term);
      if (!cancelled) setFound({ term, items });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  function add(item: StockItem) {
    setError("");
    setLines((current) =>
      current.some((l) => l.variantId === item.id)
        ? current.map((l) =>
            l.variantId === item.id
              ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) }
              : l,
          )
        : [...current, lineFromStock(item)],
    );
    setSearch("");
  }

  const change = (variantId: string, patch: Partial<OrderLine>) =>
    setLines((current) => current.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));

  const totalPieces = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

  function submit(status: "DRAFT" | "PENDING") {
    setError("");
    if (lines.length === 0) {
      setError("Inclua ao menos um item.");
      return;
    }
    const items: PurchaseItemInput[] = [];
    for (const [index, line] of lines.entries()) {
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        setError(`Item ${index + 1}: informe uma quantidade inteira maior que zero.`);
        return;
      }
      if (quantity > MAX_QUANTITY) {
        setError(`Item ${index + 1}: o máximo é ${formatQuantity(MAX_QUANTITY)} por item.`);
        return;
      }
      const cost = line.unitCost.trim() === "" ? undefined : Number(line.unitCost.replace(",", "."));
      if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
        setError(`Item ${index + 1}: custo inválido.`);
        return;
      }
      items.push({ variantId: line.variantId, quantity, unitCost: cost });
    }
    if (status === "PENDING" && !supplierId) {
      setError("Escolha o fornecedor para deixar o pedido pendente.");
      return;
    }

    startTransition(async () => {
      const result: OrderResult | { error: string } = await safeCall(
        () =>
          initial
            ? updatePurchaseOrder(initial.id, {
                supplierId: supplierId || null,
                notes: notes.trim() || null,
                expectedAt: expectedAt || null,
                items,
              })
            : createPurchaseOrder({
                supplierId: supplierId || undefined,
                notes: notes.trim() || undefined,
                expectedAt: expectedAt || undefined,
                status,
                idempotencyKey: key,
                items,
              }),
        NETWORK_ERROR,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/compras/pedidos/${result.order.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <Card title="Dados do pedido">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fornecedor" htmlFor="po-supplier">
            <select
              id="po-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={inputClass}
            >
              <option value="">Escolher depois (só rascunho)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Previsão de chegada" htmlFor="po-expected">
            <input
              id="po-expected"
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Observações" htmlFor="po-notes" className="sm:col-span-2">
            <textarea
              id="po-notes"
              value={notes}
              maxLength={1000}
              rows={2}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condições combinadas, prazo, contato..."
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card visible title="Itens" description="Busque pelo nome, referência ou código do SKU.">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ex.: camisa linho, 0002326 ou código do SKU"
            aria-label="Buscar SKU"
            autoComplete="off"
            className={`${inputClass} pl-9`}
          />
          {(results.length > 0 || searching) && (
            <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
              {searching && results.length === 0 && (
                <li className="px-4 py-3 text-sm text-neutral-500">Buscando...</li>
              )}
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => add(item)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-neutral-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.product.name}</span>
                      <span className="text-xs text-neutral-500">
                        {variantLabel(item)} · <span className="font-mono">{item.sku}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold">{item.quantity} em estoque</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <ul className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {lines.map((line) => (
              <li
                key={line.variantId}
                className="grid gap-3 p-3 sm:grid-cols-[1fr_7rem_8rem_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{line.name}</p>
                  <p className="text-xs text-neutral-500">
                    {variantLabel(line)} · <span className="font-mono">{line.sku}</span> · estoque{" "}
                    {line.stock}
                  </p>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_QUANTITY}
                  aria-label="Quantidade"
                  value={line.quantity}
                  onChange={(e) => change(line.variantId, { quantity: e.target.value })}
                  className={inputClass}
                />
                <input
                  inputMode="decimal"
                  aria-label="Custo unitário (R$)"
                  placeholder="Custo un. (R$)"
                  value={line.unitCost}
                  onChange={(e) => change(line.variantId, { unitCost: e.target.value })}
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label="Remover item"
                  title="Remover item"
                  onClick={() => setLines((c) => c.filter((l) => l.variantId !== line.variantId))}
                  className="justify-self-end rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {lines.length === 0 && (
          <p className="mt-4 text-sm text-neutral-500">Nenhum item ainda.</p>
        )}
        {lines.length > 0 && (
          <p className="mt-3 text-sm text-neutral-600">
            {lines.length} item(ns) · {formatQuantity(totalPieces)} peça(s)
          </p>
        )}
      </Card>

      <FormMessage state={{ error }} />
      <div className="flex flex-wrap justify-end gap-2">
        {initial ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(initial.status)}
            className={buttonClass.primary}
          >
            {pending ? "Salvando..." : "Salvar alterações"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("DRAFT")}
              className={buttonClass.secondary}
            >
              Salvar rascunho
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => submit("PENDING")}
              className={buttonClass.primary}
            >
              {pending ? "Salvando..." : "Criar pedido pendente"}
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Criar ou editar o pedido não altera o estoque. As peças entram quando você registrar o recebimento.
      </p>
    </div>
  );
}
