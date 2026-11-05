"use client";

import { savePurchaseSettings } from "@/lib/purchase-actions";
import type { PurchaseParams } from "@/lib/types";
import { FormMessage } from "./form-message";
import { buttonClass, Field, hintClass, inputClass } from "./ui";
import { useFormAction } from "./use-form-action";

const FIELDS: {
  name: keyof PurchaseParams;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  { name: "analysisDays", label: "Janela de vendas (dias)", hint: "Quanto tempo de vendas olhar para trás.", min: 7, max: 366 },
  { name: "leadTimeDays", label: "Prazo de entrega (dias)", hint: "Do pedido até a mercadoria chegar.", min: 0, max: 180 },
  { name: "coverDays", label: "Cobertura desejada (dias)", hint: "Por quantos dias a compra deve durar depois de chegar.", min: 1, max: 365 },
  { name: "minSales", label: "Vendas mínimas", hint: "Menos vendas que isso: sem dados para recomendar.", min: 1, max: 100 },
  { name: "minHistoryDays", label: "Histórico mínimo (dias)", hint: "Variações mais novas que isso: sem dados.", min: 1, max: 366 },
  { name: "excessDays", label: "Excesso acima de (dias)", hint: "Estoque que dura mais que isso é excesso.", min: 30, max: 1095 },
];

export function PurchaseSettingsForm({ params }: { params: PurchaseParams }) {
  const { state, pending, formRef, onSubmit } = useFormAction(savePurchaseSettings);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <Field key={f.name} label={f.label} htmlFor={`ps-${f.name}`}>
            <input
              id={`ps-${f.name}`}
              name={f.name}
              type="number"
              inputMode="numeric"
              required
              min={f.min}
              max={f.max}
              defaultValue={params[f.name]}
              className={inputClass}
            />
            <p className={hintClass}>{f.hint}</p>
          </Field>
        ))}
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Salvando..." : "Salvar parâmetros"}
      </button>
    </form>
  );
}
