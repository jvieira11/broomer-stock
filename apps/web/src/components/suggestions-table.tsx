"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createDraftsFromSuggestions } from "@/lib/purchase-actions";
import { formatQuantity, variantLabel } from "@/lib/format";
import { classificationLabels, classificationTones } from "@/lib/purchases";
import { safeCall } from "@/lib/network";
import type { SuggestionRow } from "@/lib/types";
import { FormMessage } from "./form-message";
import { Badge, buttonClass, cellClass, inputClass, rowClass } from "./ui";

// Lista de sugestões de compra. Quem pode criar pedidos seleciona itens, ajusta
// as quantidades (a sugestão é só o ponto de partida) e gera os rascunhos.
export function SuggestionsTable({
  rows,
  canCreate,
}: {
  rows: SuggestionRow[];
  canCreate: boolean;
}) {
  // Quantidade escolhida por variação; vazio = ainda não selecionada.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  const selected = useMemo(() => Object.keys(picked), [picked]);
  // Só o que tem número sugerido pode ser marcado de uma vez; as demais
  // linhas (sem dados, parado...) podem ser escolhidas uma a uma.
  const actionable = rows.filter((r) => (r.suggested ?? 0) > 0);
  const allMarked = actionable.length > 0 && actionable.every((r) => r.variantId in picked);

  function toggle(row: SuggestionRow) {
    setError("");
    setPicked((current) => {
      const next = { ...current };
      if (row.variantId in next) delete next[row.variantId];
      else next[row.variantId] = String(row.suggested ?? row.minShortfall ?? 1) || "1";
      if (next[row.variantId] === "0") next[row.variantId] = "1";
      return next;
    });
  }

  function toggleAll() {
    setError("");
    setPicked((current) => {
      const next = { ...current };
      for (const row of actionable) {
        if (allMarked) delete next[row.variantId];
        else if (!(row.variantId in next)) next[row.variantId] = String(row.suggested);
      }
      return next;
    });
  }

  function createDrafts() {
    setError("");
    const items: { variantId: string; quantity: number }[] = [];
    for (const variantId of selected) {
      const quantity = Number(picked[variantId]);
      if (!Number.isInteger(quantity) || quantity < 1) {
        setError("Confira as quantidades: use números inteiros maiores que zero.");
        return;
      }
      items.push({ variantId, quantity });
    }
    startTransition(async () => {
      const result = await safeCall(() => createDraftsFromSuggestions({ idempotencyKey: key, items }));
      // Sucesso redireciona; só chega aqui se houver erro.
      const failure: { error?: string } | undefined = result;
      if (failure?.error) {
        setError(failure.error);
        setKey(crypto.randomUUID());
      }
    });
  }

  return (
    <div>
      {canCreate && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
          <p className="text-sm text-neutral-600">
            {selected.length === 0
              ? "Marque os itens para montar o pedido. A quantidade pode ser alterada."
              : `${selected.length} item(ns) selecionado(s) · ${formatQuantity(
                  selected.reduce((s, id) => s + (Number(picked[id]) || 0), 0),
                )} peça(s)`}
          </p>
          <button
            type="button"
            disabled={selected.length === 0 || pending}
            onClick={createDrafts}
            className={buttonClass.primary}
          >
            {pending ? "Criando..." : "Criar rascunho de pedido"}
          </button>
        </div>
      )}
      {error && (
        <div className="px-4 pt-3">
          <FormMessage state={{ error }} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            <tr>
              {canCreate && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Marcar todos com quantidade sugerida"
                    checked={allMarked}
                    onChange={toggleAll}
                    disabled={actionable.length === 0}
                  />
                </th>
              )}
              {["Produto", "Fornecedor", "Estoque", "Vendas", "Sugerido", "Situação"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => {
              const isPicked = row.variantId in picked;
              return (
                <tr key={row.variantId} className={rowClass}>
                  {canCreate && (
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${row.product.name} ${variantLabel(row)}`}
                        checked={isPicked}
                        onChange={() => toggle(row)}
                      />
                    </td>
                  )}
                  <td className="min-w-48 px-3 py-3 align-top">
                    <Link href={`/produtos/${row.product.id}`} className="font-medium hover:underline">
                      {row.product.name}
                    </Link>
                    <span className="block text-xs text-neutral-500">
                      {variantLabel(row)} · <span className="font-mono">{row.sku}</span>
                      {row.category && <> · {row.category.name}</>}
                    </span>
                    <details className="mt-1 text-xs text-neutral-500">
                      <summary className="cursor-pointer select-none hover:text-ink-900">Por quê?</summary>
                      <p className="mt-1 max-w-md leading-relaxed">{row.reason}</p>
                    </details>
                  </td>
                  <td className="min-w-32 px-3 py-3 align-top text-neutral-600">
                    {row.supplier?.name ?? "—"}
                  </td>
                  <td className={`${cellClass} align-top`}>
                    <span className="font-semibold">{row.quantity}</span>
                    {row.minQuantity > 0 && (
                      <span className="block text-xs text-neutral-500">mín. {row.minQuantity}</span>
                    )}
                    {row.onOrder > 0 && (
                      <span className="block text-xs text-sky-700">+{row.onOrder} a caminho</span>
                    )}
                  </td>
                  <td className={`${cellClass} align-top`}>{row.sold}</td>
                  <td className={`${cellClass} align-top`}>
                    {isPicked ? (
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        aria-label="Quantidade a comprar"
                        value={picked[row.variantId]}
                        onChange={(e) =>
                          setPicked((c) => ({ ...c, [row.variantId]: e.target.value }))
                        }
                        className={`${inputClass} w-24 py-1`}
                      />
                    ) : row.suggested === null ? (
                      <span
                        className="text-xs text-neutral-500"
                        title="Sem histórico suficiente para calcular"
                      >
                        {row.minShortfall ? `faltam ${row.minShortfall} p/ mínimo` : "sem dados"}
                      </span>
                    ) : (
                      <span className={row.suggested > 0 ? "font-bold" : "text-neutral-400"}>
                        {row.suggested}
                      </span>
                    )}
                  </td>
                  <td className={`${cellClass} align-top`}>
                    <Badge tone={classificationTones[row.classification]}>
                      {classificationLabels[row.classification]}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
