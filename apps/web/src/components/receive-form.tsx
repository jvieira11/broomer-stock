"use client";

import { useState, useTransition } from "react";
import { receivePurchaseOrder } from "@/lib/purchase-actions";
import { variantLabel } from "@/lib/format";
import { safeCall } from "@/lib/network";
import type { PurchaseOrderItem } from "@/lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import { FormMessage } from "./form-message";
import { buttonClass, Card, inputClass } from "./ui";

// Recebimento (parcial ou total). Cada envio gera uma entrada no estoque,
// ligada ao pedido; a quantidade já vem preenchida com o que falta receber.
export function ReceiveForm({
  orderId,
  number,
  items,
}: {
  orderId: string;
  number: number;
  items: PurchaseOrderItem[];
}) {
  const open = items.filter((i) => i.quantityOrdered > i.quantityReceived);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(open.map((i) => [i.id, String(i.quantityOrdered - i.quantityReceived)])),
  );
  const [costs, setCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(open.map((i) => [i.id, i.unitCost ? String(Number(i.unitCost)) : ""])),
  );
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  // Uma chave por recebimento: reenviar não entra em duplicidade. Depois de
  // um sucesso a página recarrega os itens e um novo formulário começa.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  // Tudo recebido: o formulário some, mas a confirmação do último
  // recebimento continua visível.
  if (open.length === 0) {
    return message.success ? <FormMessage state={message} /> : null;
  }

  const lines = open
    .map((item) => ({ item, quantity: Number(quantities[item.id] || 0) }))
    .filter((l) => l.quantity > 0);
  const pieces = lines.reduce((s, l) => s + l.quantity, 0);

  function validate() {
    for (const { item, quantity } of lines) {
      const remaining = item.quantityOrdered - item.quantityReceived;
      if (!Number.isInteger(quantity) || quantity > remaining) {
        return `${item.variant.product.name} ${variantLabel(item.variant)}: o máximo a receber é ${remaining}.`;
      }
    }
    for (const { item } of lines) {
      const raw = (costs[item.id] ?? "").trim();
      if (raw !== "" && !(Number(raw.replace(",", ".")) >= 0)) {
        return `${item.variant.product.name}: custo inválido.`;
      }
    }
    return lines.length === 0 ? "Informe a quantidade recebida de ao menos um item." : "";
  }

  function submit() {
    startTransition(async () => {
      const result = await safeCall(() =>
        receivePurchaseOrder(orderId, {
          idempotencyKey: key,
          notes: notes.trim() || undefined,
          items: lines.map(({ item, quantity }) => {
            const raw = (costs[item.id] ?? "").trim();
            return {
              itemId: item.id,
              quantity,
              unitCost: raw === "" ? undefined : Number(raw.replace(",", ".")),
            };
          }),
        }),
      );
      setConfirming(false);
      const outcome: { error?: string; success?: string } = result;
      setMessage(outcome);
      if (outcome.success) {
        setKey(crypto.randomUUID());
        setNotes("");
      }
    });
  }

  return (
    <Card
      title="Registrar recebimento"
      description="Informe o que chegou. Só aqui o estoque aumenta, com uma entrada ligada a este pedido."
    >
      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
        {open.map((item) => (
          <li key={item.id} className="grid gap-3 p-3 sm:grid-cols-[1fr_7rem_8rem] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.variant.product.name}</p>
              <p className="text-xs text-neutral-500">
                {variantLabel(item.variant)} · <span className="font-mono">{item.variant.sku}</span> · faltam{" "}
                {item.quantityOrdered - item.quantityReceived} de {item.quantityOrdered}
              </p>
            </div>
            <input
              type="number"
              min={0}
              max={item.quantityOrdered - item.quantityReceived}
              inputMode="numeric"
              aria-label={`Recebido: ${item.variant.product.name} ${variantLabel(item.variant)}`}
              value={quantities[item.id] ?? ""}
              onChange={(e) => setQuantities((c) => ({ ...c, [item.id]: e.target.value }))}
              className={inputClass}
            />
            <input
              inputMode="decimal"
              aria-label="Custo unitário real (R$)"
              placeholder="Custo un. (R$)"
              value={costs[item.id] ?? ""}
              onChange={(e) => setCosts((c) => ({ ...c, [item.id]: e.target.value }))}
              className={inputClass}
            />
          </li>
        ))}
      </ul>
      <textarea
        value={notes}
        maxLength={500}
        rows={2}
        aria-label="Observações do recebimento"
        placeholder="Observações (nota fiscal, divergências...)"
        onChange={(e) => setNotes(e.target.value)}
        className={`${inputClass} mt-3`}
      />
      <div className="mt-3">
        <FormMessage state={message} />
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const problem = validate();
            if (problem) setMessage({ error: problem });
            else {
              setMessage({});
              setConfirming(true);
            }
          }}
          className={buttonClass.primary}
        >
          Registrar recebimento
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={`Receber ${pieces} peça(s) do pedido #${number}?`}
        confirmLabel="Confirmar recebimento"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={submit}
      >
        <p>
          O estoque será atualizado agora, com uma entrada registrada no histórico. Se for um engano, a entrada pode ser estornada.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
