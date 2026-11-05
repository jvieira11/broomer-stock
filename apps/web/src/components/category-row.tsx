"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteCategory, setCategoryActive } from "@/lib/actions";
import { safeCall } from "@/lib/network";
import type { Category } from "@/lib/types";
import { CategoryForm } from "./category-form";
import { ConfirmDialog } from "./confirm-dialog";
import { Badge, buttonClass, linkClass } from "./ui";

export function CategoryRow({
  category,
  canEdit,
}: {
  category: Category;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<"toggle" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const count = category._count?.products ?? 0;

  if (editing) {
    return (
      <li className="py-4">
        <CategoryForm category={category} onDone={() => setEditing(false)} />
      </li>
    );
  }

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await safeCall(action);
      setError(result.error ?? "");
      setDialog(null);
    });
  }

  return (
    <li className={`flex flex-wrap items-center justify-between gap-3 py-4 ${category.active ? "" : "opacity-70"}`}>
      <div>
        <p className="flex items-center gap-2 font-semibold text-ink-900">
          {category.name}
          {!category.active && <Badge>Desativada</Badge>}
        </p>
        {category.description && (
          <p className="text-sm text-neutral-500">{category.description}</p>
        )}
        <Link href={`/produtos?categoryId=${category.id}`} className={`text-xs ${linkClass}`}>
          {count} produto(s)
        </Link>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className={buttonClass.secondary}>
            Editar
          </button>
          <button type="button" onClick={() => setDialog("toggle")} className={buttonClass.secondary}>
            {category.active ? "Desativar" : "Reativar"}
          </button>
          {count === 0 && (
            <button type="button" onClick={() => setDialog("delete")} className={buttonClass.danger}>
              Excluir
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={dialog === "toggle"}
        title={category.active ? `Desativar "${category.name}"?` : `Reativar "${category.name}"?`}
        confirmLabel={category.active ? "Desativar" : "Reativar"}
        pending={pending}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => setCategoryActive(category.id, !category.active))}
      >
        {category.active
          ? `A categoria deixa de aparecer no cadastro de produtos. Os ${count} produto(s) dela continuam classificados.`
          : "A categoria volta a aparecer no cadastro de produtos."}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "delete"}
        title={`Excluir "${category.name}"?`}
        confirmLabel="Excluir"
        tone="danger"
        pending={pending}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => deleteCategory(category.id))}
      >
        A categoria não tem produtos e será removida.
      </ConfirmDialog>
    </li>
  );
}
