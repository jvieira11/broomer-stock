"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteSalesImport } from "@/lib/sales-actions";
import { safeCall } from "@/lib/network";
import { ConfirmDialog } from "./confirm-dialog";
import { FormMessage } from "./form-message";
import { buttonClass } from "./ui";

// Remove uma importação de vendas (só as linhas dela; o estoque não muda).
export function DeleteSalesImport({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${buttonClass.danger} px-2.5 py-1 text-xs`}
        aria-label={`Remover importação ${label}`}
      >
        <Trash2 size={14} /> Remover
      </button>
      <ConfirmDialog
        open={open}
        title={`Remover a importação ${label}?`}
        confirmLabel="Remover"
        tone="danger"
        pending={pending}
        onCancel={() => {
          setOpen(false);
          setError("");
        }}
        onConfirm={() =>
          startTransition(async () => {
            const result: { error?: string } = await safeCall(() => deleteSalesImport(id));
            if (result.error) setError(result.error);
            else setOpen(false);
          })
        }
      >
        <p>
          As linhas de venda dessa importação saem da análise. O estoque e os pedidos de compra não são
          alterados. Dá para importar o arquivo de novo depois.
        </p>
        {error && (
          <div className="mt-3">
            <FormMessage state={{ error }} />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
