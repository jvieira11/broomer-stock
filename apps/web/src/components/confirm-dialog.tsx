"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { buttonClass } from "./ui";

// Modal de confirmação para operações importantes (usa <dialog> nativo:
// foco preso, Esc fecha, acessível).
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "primary",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger" | "accent";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 text-ink-900 shadow-2xl backdrop:bg-ink-950/50"
    >
      <div className="p-6">
        <h2 className="text-lg font-bold">{title}</h2>
        {children && <div className="mt-3 text-sm text-neutral-600">{children}</div>}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-6 py-4">
        <button type="button" onClick={onCancel} disabled={pending} className={buttonClass.secondary}>
          Voltar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          autoFocus
          className={buttonClass[tone]}
        >
          {pending ? "Aguarde..." : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
