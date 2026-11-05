"use client";

import { CheckCircle2, Minus, Plus, ScanLine, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createOperation,
  type OperationResult,
  searchVariants,
} from "@/lib/actions";
import {
  formatCurrency,
  localDateTimeInput,
  operationDescriptions,
  operationLabels,
  variantLabel,
} from "@/lib/format";
import type { OperationType, StockItem } from "@/lib/types";
import { safeCall } from "@/lib/network";
import { ConfirmDialog } from "./confirm-dialog";
import {
  buttonClass,
  Card,
  Field,
  hintClass,
  inputClass,
  StatusBadge,
} from "./ui";

const OUT_TYPES: OperationType[] = ["SALE", "SUPPLIER_RETURN", "LOSS"];
const REASON_REQUIRED: OperationType[] = [
  "CUSTOMER_RETURN",
  "SUPPLIER_RETURN",
  "LOSS",
  "INVENTORY",
];

interface Item {
  variant: StockItem;
  quantity: string;
  unitCost: string;
}

// Mesmo limite da API (apps/api/src/common/limits.ts): avisa antes de enviar.
const MAX_QUANTITY = 1_000_000;

const newKey = () => crypto.randomUUID();

// A chave de repetição não muda ao tentar de novo: se o pedido chegou ao
// servidor e só a resposta se perdeu, confirmar outra vez devolve a operação
// já gravada em vez de criar uma segunda.
const NETWORK_ERROR_OPERATION =
  "Sem conexão com o servidor. O que você digitou foi mantido: confira a internet e confirme de novo. Se a operação já tiver sido gravada, ela não será duplicada.";

// Converte o valor do <input type="datetime-local"> (horário de Maceió).
const toIso = (local: string) => new Date(`${local}:00-03:00`).toISOString();

export function OperationForm({
  allowedTypes,
  initialType,
  preset,
}: {
  allowedTypes: OperationType[];
  initialType: OperationType;
  // Variações sugeridas (ex.: vindo da página de um produto).
  preset: StockItem[];
}) {
  const [type, setType] = useState<OperationType>(initialType);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  // Resultado da última busca concluída e o termo a que se refere.
  const [found, setFound] = useState<{ term: string; items: StockItem[] }>({
    term: "",
    items: [],
  });
  const [occurredAt, setOccurredAt] = useState(() => localDateTimeInput());
  const [saleReference, setSaleReference] = useState("");
  const [origin, setOrigin] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  // Uma chave por operação: reenviar (duplo clique, rede lenta) não duplica.
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Extract<OperationResult, { operation: unknown }>["operation"] | null>(null);
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const isOut = OUT_TYPES.includes(type);
  const isEntry = type === "ENTRY";
  const isInventory = type === "INVENTORY";

  const term = search.trim();
  const results = term.length >= 2 && found.term === term ? found.items : [];
  const searching = term.length >= 2 && found.term !== term;

  // Busca com pequena espera, para não chamar a API a cada tecla.
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

  function add(variant: StockItem) {
    setError("");
    setItems((current) => {
      const existing = current.find((i) => i.variant.id === variant.id);
      if (existing) {
        return current.map((i) =>
          i.variant.id === variant.id && !isInventory
            ? { ...i, quantity: String((Number(i.quantity) || 0) + 1) }
            : i,
        );
      }
      return [
        ...current,
        { variant, quantity: isInventory ? String(variant.quantity) : "1", unitCost: "" },
      ];
    });
    setSearch("");
    searchRef.current?.focus();
  }

  const update = (id: string, changes: Partial<Item>) =>
    setItems((current) =>
      current.map((i) => (i.variant.id === id ? { ...i, ...changes } : i)),
    );

  const problems = useMemo(() => {
    const list: string[] = [];
    if (items.length === 0) list.push("Inclua pelo menos uma peça.");
    for (const item of items) {
      const quantity = Number(item.quantity);
      const name = `${item.variant.product.name} (${variantLabel(item.variant)})`;
      if (!Number.isInteger(quantity) || quantity < (isInventory ? 0 : 1)) {
        list.push(`${name}: quantidade inválida.`);
      } else if (quantity > MAX_QUANTITY) {
        list.push(`${name}: o máximo é ${MAX_QUANTITY.toLocaleString("pt-BR")} por item.`);
      } else if (isOut && quantity > item.variant.quantity) {
        list.push(`${name}: saldo disponível é ${item.variant.quantity}.`);
      } else if (isInventory && quantity === item.variant.quantity) {
        list.push(`${name}: a contagem é igual ao saldo atual.`);
      }
    }
    if (REASON_REQUIRED.includes(type) && !reason.trim()) {
      list.push("Informe o motivo.");
    }
    return list;
  }, [items, isOut, isInventory, type, reason]);

  const totalPieces = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  function submit() {
    setError("");
    startTransition(async () => {
      const payload = {
        type,
        occurredAt: occurredAt ? toIso(occurredAt) : undefined,
        saleReference: type === "SALE" ? saleReference || undefined : undefined,
        origin: isEntry || type === "SUPPLIER_RETURN" ? origin || undefined : undefined,
        reason: reason || undefined,
        notes: notes || undefined,
        idempotencyKey,
        items: items.map((i) => ({
          variantId: i.variant.id,
          quantity: Number(i.quantity),
          unitCost:
            isEntry && i.unitCost.trim()
              ? Number(i.unitCost.replace(",", "."))
              : undefined,
        })),
      };
      const result = await safeCall(
        () => createOperation(payload),
        NETWORK_ERROR_OPERATION,
      );
      setConfirming(false);
      if ("error" in result) {
        setError(result.error);
      } else {
        setDone(result.operation);
      }
    });
  }

  function reset() {
    setItems([]);
    setSaleReference("");
    setOrigin("");
    setReason("");
    setNotes("");
    setOccurredAt(localDateTimeInput());
    setIdempotencyKey(newKey());
    setDone(null);
    setError("");
  }

  if (done) {
    return (
      <Card>
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle2 size={40} className="text-emerald-600" />
          <p className="mt-3 text-lg font-bold">
            {operationLabels[done.type]} #{done.number} registrada
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {totalPieces} peça(s) em {items.length} SKU(s). Os saldos já foram atualizados.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={reset} className={buttonClass.primary}>
              Registrar outra
            </button>
            <Link href={`/movimentacoes/${done.id}`} className={buttonClass.secondary}>
              Ver operação
            </Link>
            <Link href="/estoque" className={buttonClass.ghost}>
              Consultar estoque
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const presetLeft = preset.filter((v) => !items.some((i) => i.variant.id === v.id));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card title="Tipo de operação">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allowedTypes.map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-xl border p-3 transition ${
                  type === t
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-neutral-200 hover:border-neutral-400"
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={t}
                  checked={type === t}
                  onChange={() => {
                    setType(t);
                    setError("");
                  }}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold">{operationLabels[t]}</span>
                <span className={`mt-0.5 block text-xs ${type === t ? "text-neutral-300" : "text-neutral-500"}`}>
                  {operationDescriptions[t]}
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card
          visible
          title="Peças"
          description={isInventory ? "Informe a contagem real de cada SKU." : "Busque pelo nome, referência ou bipe o código de barras."}
        >
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                // Leitor de código de barras: SKU exato entra direto.
                const exact = results.find((r) => r.sku === search.trim());
                if (exact) add(exact);
                else if (results.length === 1) add(results[0]);
              }}
              placeholder="Ex.: camisa linho, 0002326 ou código do SKU"
              aria-label="Buscar SKU"
              autoComplete="off"
              autoFocus
              className={`${inputClass} pl-9`}
            />
            <ScanLine size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300" />
            {(results.length > 0 || (searching && search.trim().length >= 2)) && (
              <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
                {searching && results.length === 0 && (
                  <li className="px-4 py-3 text-sm text-neutral-500">Buscando...</li>
                )}
                {results.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => add(v)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-neutral-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{v.product.name}</span>
                        <span className="text-xs text-neutral-500">
                          {variantLabel(v)} · <span className="font-mono">{v.sku}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs">
                        <span className="block font-bold">{v.quantity} em estoque</span>
                        <StatusBadge status={v.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!searching && search.trim().length >= 2 && results.length === 0 && (
              <p className={hintClass}>Nenhum SKU ativo encontrado.</p>
            )}
          </div>

          {presetLeft.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Variações de {preset[0].product.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {presetLeft.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => add(v)}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:border-ink-800"
                  >
                    {variantLabel(v)} <span className="text-neutral-400">({v.quantity})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <ul className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {items.map((item) => {
                const quantity = Number(item.quantity) || 0;
                const after = isInventory
                  ? quantity
                  : item.variant.quantity + (isOut ? -quantity : quantity);
                return (
                  <li key={item.variant.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.variant.product.name}</p>
                      <p className="text-xs text-neutral-500">
                        {variantLabel(item.variant)} · <span className="font-mono">{item.variant.sku}</span>
                      </p>
                      <p className={`text-xs ${after < 0 ? "font-semibold text-red-600" : "text-neutral-500"}`}>
                        Saldo: {item.variant.quantity} → {after}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isInventory && (
                        <button
                          type="button"
                          aria-label="Diminuir"
                          onClick={() => update(item.variant.id, { quantity: String(Math.max(1, quantity - 1)) })}
                          className="rounded-lg border border-neutral-200 p-1.5 hover:bg-neutral-100"
                        >
                          <Minus size={14} />
                        </button>
                      )}
                      <input
                        aria-label={isInventory ? "Contagem" : "Quantidade"}
                        type="number"
                        inputMode="numeric"
                        min={isInventory ? 0 : 1}
                        step={1}
                        value={item.quantity}
                        onChange={(e) => update(item.variant.id, { quantity: e.target.value })}
                        className={`${inputClass} w-20 text-center font-semibold`}
                      />
                      {!isInventory && (
                        <button
                          type="button"
                          aria-label="Aumentar"
                          onClick={() => update(item.variant.id, { quantity: String(quantity + 1) })}
                          className="rounded-lg border border-neutral-200 p-1.5 hover:bg-neutral-100"
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                    {isEntry && (
                      <input
                        aria-label="Custo unitário (R$)"
                        placeholder="Custo un. (R$)"
                        inputMode="decimal"
                        value={item.unitCost}
                        onChange={(e) => update(item.variant.id, { unitCost: e.target.value })}
                        className={`${inputClass} w-32`}
                      />
                    )}
                    <button
                      type="button"
                      aria-label="Remover"
                      onClick={() => setItems(items.filter((i) => i.variant.id !== item.variant.id))}
                      className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="Detalhes">
          <div className="space-y-4">
            <Field label="Data e hora" htmlFor="occurredAt" hint="Pode ser anterior ao registro.">
              <input
                id="occurredAt"
                type="datetime-local"
                value={occurredAt}
                max={localDateTimeInput()}
                onChange={(e) => setOccurredAt(e.target.value)}
                className={inputClass}
              />
            </Field>
            {type === "SALE" && (
              <Field label="Nº da venda / cupom" htmlFor="saleReference" hint="Opcional, para localizar depois.">
                <input id="saleReference" maxLength={60} value={saleReference} onChange={(e) => setSaleReference(e.target.value)} className={inputClass} />
              </Field>
            )}
            {(isEntry || type === "SUPPLIER_RETURN") && (
              <Field label={isEntry ? "Fornecedor / origem" : "Fornecedor"} htmlFor="origin" hint={isEntry ? "Ex.: fornecedor, nota fiscal, transferência." : undefined}>
                <input id="origin" maxLength={150} value={origin} onChange={(e) => setOrigin(e.target.value)} className={inputClass} />
              </Field>
            )}
            <Field
              label={REASON_REQUIRED.includes(type) ? "Motivo *" : "Motivo"}
              htmlFor="reason"
              hint={type === "LOSS" ? "Ex.: peça manchada, furto, extravio." : undefined}
            >
              <input id="reason" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Observações" htmlFor="notes">
              <textarea id="notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Resumo</p>
          <p className="mt-1 text-2xl font-bold">
            {totalPieces} peça(s)
          </p>
          <p className="text-sm text-neutral-500">
            {operationLabels[type]} · {items.length} SKU(s)
            {type === "SALE" && items.length > 0 && (
              <> · {formatCurrency(items.reduce((s, i) => s + (Number(i.quantity) || 0) * Number(i.variant.salePrice), 0))} pelo preço de tabela</>
            )}
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {items.length > 0 && problems.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-800">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={problems.length > 0 || pending}
            onClick={() => setConfirming(true)}
            className={`${type === "SALE" ? buttonClass.accent : buttonClass.primary} mt-4 w-full`}
          >
            Registrar {operationLabels[type].toLowerCase()}
          </button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Confirmar ${operationLabels[type].toLowerCase()}?`}
        confirmLabel="Confirmar"
        tone={type === "SALE" ? "accent" : "primary"}
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={submit}
      >
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.variant.id} className="flex justify-between gap-3">
              <span className="truncate">
                {i.variant.product.name} · {variantLabel(i.variant)}
              </span>
              <span className="font-semibold text-ink-900">
                {isInventory ? `contagem ${i.quantity}` : `${isOut ? "−" : "+"}${i.quantity}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs">
          Operações não podem ser editadas depois. Erros se corrigem com estorno.
        </p>
      </ConfirmDialog>
    </div>
  );
}
