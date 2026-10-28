"use client";

import { saveCategory } from "@/lib/actions";
import type { Category, FormState } from "@/lib/types";
import { FormMessage } from "./form-message";
import { buttonClass, inputClass, labelClass } from "./ui";
import { useFormAction } from "./use-form-action";

export function CategoryForm({
  category,
  onDone,
}: {
  category?: Category;
  onDone?: () => void;
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(
    async (prev: FormState, formData: FormData) => {
      const result = await saveCategory(prev, formData);
      if (result.success) onDone?.();
      return result;
    },
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      {category && <input type="hidden" name="id" value={category.id} />}
      <div>
        <label htmlFor={`name-${category?.id ?? "new"}`} className={labelClass}>
          Nome *
        </label>
        <input
          id={`name-${category?.id ?? "new"}`}
          name="name"
          required
          maxLength={100}
          defaultValue={category?.name}
          className={inputClass}
        />
      </div>
      <div>
        <label
          htmlFor={`description-${category?.id ?? "new"}`}
          className={labelClass}
        >
          Descrição
        </label>
        <input
          id={`description-${category?.id ?? "new"}`}
          name="description"
          maxLength={500}
          defaultValue={category?.description ?? ""}
          className={inputClass}
        />
      </div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "Salvando..." : category ? "Salvar" : "Criar categoria"}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className={buttonClass.secondary}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
