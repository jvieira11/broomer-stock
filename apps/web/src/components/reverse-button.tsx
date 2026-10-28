"use client";

import { Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { reverseOperation } from "@/lib/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { buttonClass, inputClass, labelClass } from "./ui";

// Estorno: cria uma operação inversa; a original fica no histórico.
export function ReverseButton({ id, number }: { id: string; number: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (reason.trim().length < 3) {
      setError("Informe o motivo do estorno.");
      return;
    }
    startTransition(async () => {
      const result = await reverseOperation(id, reason.trim(), key);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass.danger}>
        <Undo2 size={16} /> Estornar
      </button>
      <ConfirmDialog
        open={open}
        title={`Estornar a operação #${number}?`}
        confirmLabel="Estornar"
        tone="danger"
        pending={pending}
        onCancel={() => {
          setOpen(false);
          setError("");
        }}
        onConfirm={confirm}
      >
        <p>
          Todos os itens serão desfeitos com uma nova operação de estorno. A
          operação original continua no histórico, marcada como estornada.
        </p>
        <label htmlFor="reverse-reason" className={`${labelClass} mt-4`}>
          Motivo *
        </label>
        <input
          id="reverse-reason"
          value={reason}
          maxLength={255}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: venda lançada em duplicidade"
          className={inputClass}
        />
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </ConfirmDialog>
    </>
  );
}
