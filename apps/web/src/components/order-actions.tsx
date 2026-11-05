"use client";

import { Pencil, Send, XCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { changePurchaseStatus } from "@/lib/purchase-actions";
import { safeCall } from "@/lib/network";
import type { PurchaseStatus } from "@/lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import { FormMessage } from "./form-message";
import { buttonClass } from "./ui";

type Target = "PENDING" | "SENT" | "CANCELLED";

const COPY: Record<Target, { title: string; body: string; confirm: string }> = {
  PENDING: {
    title: "Confirmar o pedido?",
    body: "O pedido passa a Pendente e entra na conta de peças a caminho nas sugestões. Ainda não altera o estoque.",
    confirm: "Confirmar pedido",
  },
  SENT: {
    title: "Marcar como enviado ao fornecedor?",
    body: "Use depois de mandar o pedido ao fornecedor. O estoque só sobe quando você registrar o recebimento.",
    confirm: "Marcar como enviado",
  },
  CANCELLED: {
    title: "Cancelar o pedido?",
    body: "O pedido fica no histórico como cancelado e deixa de contar como peças a caminho. Não altera o estoque.",
    confirm: "Cancelar pedido",
  },
};

export function OrderActions({
  id,
  status,
  canManage,
}: {
  id: string;
  status: PurchaseStatus;
  canManage: boolean;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;
  const editable = status === "DRAFT" || status === "PENDING";
  const canCancel = status === "DRAFT" || status === "PENDING" || status === "SENT";
  const next: Target | null = status === "DRAFT" ? "PENDING" : status === "PENDING" ? "SENT" : null;
  if (!editable && !canCancel) return null;

  function confirm() {
    if (!target) return;
    startTransition(async () => {
      const result = await safeCall(() => changePurchaseStatus(id, target));
      const outcome: { error?: string } = result;
      if (outcome.error) setError(outcome.error);
      else setTarget(null);
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {editable && (
          <Link href={`/compras/pedidos/${id}/editar`} className={buttonClass.secondary}>
            <Pencil size={16} /> Editar
          </Link>
        )}
        {next && (
          <button type="button" onClick={() => setTarget(next)} className={buttonClass.primary}>
            {next === "PENDING" ? <CheckCircle2 size={16} /> : <Send size={16} />}
            {next === "PENDING" ? "Confirmar pedido" : "Marcar como enviado"}
          </button>
        )}
        {canCancel && (
          <button type="button" onClick={() => setTarget("CANCELLED")} className={buttonClass.danger}>
            <XCircle size={16} /> Cancelar pedido
          </button>
        )}
      </div>
      {error && !target && (
        <div className="mt-3">
          <FormMessage state={{ error }} />
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        title={target ? COPY[target].title : ""}
        confirmLabel={target ? COPY[target].confirm : ""}
        tone={target === "CANCELLED" ? "danger" : "primary"}
        pending={pending}
        onCancel={() => {
          setTarget(null);
          setError("");
        }}
        onConfirm={confirm}
      >
        {target && <p>{COPY[target].body}</p>}
        {error && target && (
          <div className="mt-3">
            <FormMessage state={{ error }} />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
