"use client";

import { Check, History, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addVariant,
  deleteProduct,
  removeVariant,
  setProductActive,
  updateVariant,
} from "@/lib/actions";
import { formatCurrency, formatUnitCost } from "@/lib/format";
import type { FormState, ProductDetail, Variant } from "@/lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import { FormMessage } from "./form-message";
import {
  Badge,
  buttonClass,
  cellClass,
  inputClass,
  rowClass,
  StatusBadge,
  Table,
} from "./ui";

// Ativar/desativar e excluir o modelo.
export function ProductActions({ product }: { product: ProductDetail }) {
  const [dialog, setDialog] = useState<"toggle" | "delete" | null>(null);
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<FormState>) {
    startTransition(async () => {
      const result = await action();
      setState(result);
      setDialog(null);
    });
  }

  return (
    <>
      <Link href={`/produtos/${product.id}/editar`} className={buttonClass.secondary}>
        <Pencil size={16} /> Editar
      </Link>
      <button type="button" onClick={() => setDialog("toggle")} className={buttonClass.secondary}>
        <Power size={16} /> {product.active ? "Desativar" : "Reativar"}
      </button>
      <button type="button" onClick={() => setDialog("delete")} className={buttonClass.danger}>
        <Trash2 size={16} /> Excluir
      </button>
      {state.error && (
        <div className="w-full">
          <FormMessage state={state} />
        </div>
      )}

      <ConfirmDialog
        open={dialog === "toggle"}
        title={product.active ? "Desativar produto?" : "Reativar produto?"}
        confirmLabel={product.active ? "Desativar" : "Reativar"}
        pending={pending}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => setProductActive(product.id, !product.active))}
      >
        {product.active
          ? "O produto sai da consulta de estoque e não poderá ser movimentado. O histórico e os saldos são preservados, e você pode reativá-lo depois."
          : "O produto volta a aparecer no estoque e poderá ser movimentado."}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "delete"}
        title="Excluir produto?"
        confirmLabel="Excluir definitivamente"
        tone="danger"
        pending={pending}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => deleteProduct(product.id))}
      >
        Só é possível excluir produtos que nunca foram movimentados. Com
        histórico, desative o produto em vez de excluir.
      </ConfirmDialog>
    </>
  );
}

function VariantRow({
  variant,
  canEdit,
  onResult,
}: {
  variant: Variant;
  canEdit: boolean;
  onResult: (state: FormState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [sku, setSku] = useState(variant.sku);
  const [min, setMin] = useState(variant.minQuantity?.toString() ?? "");
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"toggle" | "delete" | null>(null);

  function run(action: () => Promise<FormState>) {
    startTransition(async () => {
      const result = await action();
      onResult(result);
      setConfirm(null);
      if (!result.error) setEditing(false);
    });
  }

  return (
    <tr className={`${rowClass} ${variant.active ? "" : "opacity-60"}`}>
      <td className={`${cellClass} font-semibold`}>{variant.size || "—"}</td>
      <td className={cellClass}>{variant.color || "—"}</td>
      <td className={`${cellClass} font-mono text-xs`}>
        {editing ? (
          <input aria-label="SKU" value={sku} onChange={(e) => setSku(e.target.value.replace(/\s/g, ""))} className={`${inputClass} w-44`} />
        ) : (
          variant.sku
        )}
      </td>
      <td className={`${cellClass} text-base font-bold`}>{variant.quantity}</td>
      <td className={cellClass}>
        {editing ? (
          <input
            aria-label="Mínimo próprio"
            type="number"
            min={0}
            step={1}
            placeholder="do modelo"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className={`${inputClass} w-28`}
          />
        ) : (
          variant.minQuantity ?? <span className="text-stone-400">do modelo</span>
        )}
      </td>
      <td className={cellClass}>
        {variant.active ? <StatusBadge status={variant.status} /> : <Badge>Desativada</Badge>}
      </td>
      <td className={`${cellClass} text-stone-500`}>{formatUnitCost(variant.averageCost)}</td>
      <td className={`${cellClass} text-right`}>
        <div className="flex justify-end gap-1">
          <Link
            href={`/movimentacoes?variantId=${variant.id}`}
            title="Histórico deste SKU"
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-ink-900"
          >
            <History size={16} />
          </Link>
          {canEdit && !editing && (
            <>
              <button type="button" title="Editar" onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-ink-900">
                <Pencil size={16} />
              </button>
              <button
                type="button"
                title={variant.active ? "Desativar" : "Reativar"}
                onClick={() => setConfirm("toggle")}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-ink-900"
              >
                <Power size={16} />
              </button>
              <button type="button" title="Excluir" onClick={() => setConfirm("delete")} className="rounded-lg p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                type="button"
                title="Salvar"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    updateVariant(variant.id, {
                      sku,
                      minQuantity: min === "" ? null : Number(min),
                    }),
                  )
                }
                className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50"
              >
                <Check size={16} />
              </button>
              <button type="button" title="Cancelar" onClick={() => setEditing(false)} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100">
                <X size={16} />
              </button>
            </>
          )}
        </div>
        <ConfirmDialog
          open={confirm === "toggle"}
          title={variant.active ? "Desativar variação?" : "Reativar variação?"}
          confirmLabel={variant.active ? "Desativar" : "Reativar"}
          pending={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => updateVariant(variant.id, { active: !variant.active }))}
        >
          {variant.active
            ? `O SKU ${variant.sku} sai do estoque e não poderá ser movimentado. O histórico fica preservado.`
            : `O SKU ${variant.sku} volta ao estoque.`}
        </ConfirmDialog>
        <ConfirmDialog
          open={confirm === "delete"}
          title="Excluir variação?"
          confirmLabel="Excluir"
          tone="danger"
          pending={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => removeVariant(variant.id))}
        >
          Só variações nunca movimentadas podem ser excluídas. Com histórico,
          desative-a.
        </ConfirmDialog>
      </td>
    </tr>
  );
}

function AddVariantForm({ productId, onResult }: { productId: string; onResult: (s: FormState) => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ size: "", color: "", sku: "" });
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass.secondary}>
        <Plus size={16} /> Adicionar variação
      </button>
    );
  }

  return (
    <form
      className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await addVariant(productId, values);
          onResult(result);
          if (!result.error) {
            setValues({ size: "", color: "", sku: "" });
            setOpen(false);
          }
        });
      }}
    >
      <input aria-label="Tamanho" placeholder="Tamanho" value={values.size} onChange={(e) => setValues({ ...values, size: e.target.value })} className={inputClass} />
      <input aria-label="Cor" placeholder="Cor" value={values.color} onChange={(e) => setValues({ ...values, color: e.target.value })} className={inputClass} />
      <input
        aria-label="SKU"
        placeholder="SKU / código *"
        required
        value={values.sku}
        onChange={(e) => setValues({ ...values, sku: e.target.value.replace(/\s/g, "") })}
        className={`${inputClass} font-mono`}
      />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "Salvando..." : "Adicionar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass.ghost}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// Grade de variações do produto, com saldo e edição.
export function VariantManager({
  product,
  canEdit,
}: {
  product: ProductDetail;
  canEdit: boolean;
}) {
  const [state, setState] = useState<FormState>({});

  return (
    <>
      {product.variants.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-stone-500">
          Nenhuma variação cadastrada. Adicione as combinações de tamanho e cor.
        </p>
      ) : (
        <Table head={["Tamanho", "Cor", "SKU", "Saldo", "Mínimo", "Situação", "Custo médio", ""]}>
          {product.variants.map((v) => (
            <VariantRow key={v.id} variant={v} canEdit={canEdit} onResult={setState} />
          ))}
        </Table>
      )}
      {(canEdit || state.error || state.success) && (
        <div className="space-y-3 border-t border-stone-100 p-4">
          <FormMessage state={state} />
          {canEdit && <AddVariantForm productId={product.id} onResult={setState} />}
          <p className="text-xs text-stone-500">
            Preço de venda: {formatCurrency(product.salePrice)} para todas as variações.
          </p>
        </div>
      )}
    </>
  );
}
