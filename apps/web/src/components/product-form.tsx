"use client";

import { Plus, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { saveProduct, type VariantInput } from "@/lib/actions";
import type { Category, Product, Supplier } from "@/lib/types";
import { FormMessage } from "./form-message";
import { buttonClass, Field, hintClass, inputClass, labelClass } from "./ui";
import { useFormAction } from "./use-form-action";

const split = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);

interface Row extends VariantInput {
  key: number;
}

let nextKey = 1;

// Grade de variações do cadastro: gera as combinações de tamanho x cor e
// permite ajustar o SKU de cada uma antes de salvar.
function VariantGrid({
  rows,
  setRows,
  reference,
}: {
  rows: Row[];
  setRows: (rows: Row[]) => void;
  reference: string;
}) {
  const [sizes, setSizes] = useState("");
  const [colors, setColors] = useState("");

  function generate() {
    const sizeList = split(sizes);
    const colorList = split(colors);
    const combos = (colorList.length ? colorList : [""]).flatMap((color) =>
      (sizeList.length ? sizeList : [""]).map((size) => ({ size, color })),
    );
    const existing = new Set(rows.map((r) => `${r.size}|${r.color}`));
    const added = combos
      .filter((c) => !existing.has(`${c.size}|${c.color}`))
      .map((c) => ({ key: nextKey++, sku: "", ...c }));
    setRows([...rows, ...added]);
  }

  const update = (key: number, changes: Partial<Row>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));

  // SKU sugerido: referência + tamanho + cor (pode ser trocado pelo código de barras).
  function suggestSkus() {
    setRows(
      rows.map((r) =>
        r.sku
          ? r
          : {
              ...r,
              sku: [reference || "REF", r.size, r.color]
                .filter(Boolean)
                .join("-")
                .replace(/\s+/g, ""),
            },
      ),
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
      <p className="text-sm font-semibold text-ink-900">Variações (SKUs)</p>
      <p className={`${hintClass} mb-4`}>
        Cada combinação de tamanho e cor tem saldo próprio. Para acessórios sem
        grade, deixe tamanho e cor em branco. O saldo começa em zero e entra
        pelo registro de entradas.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Tamanhos" htmlFor="grid-sizes" hint="Separados por vírgula: PP, P, M, G">
          <input id="grid-sizes" value={sizes} onChange={(e) => setSizes(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Cores" htmlFor="grid-colors" hint="Ex.: PRETO, AZUL MARINHO">
          <input id="grid-colors" value={colors} onChange={(e) => setColors(e.target.value)} className={inputClass} />
        </Field>
        <button type="button" onClick={generate} className={`${buttonClass.secondary} sm:mb-5`}>
          <Plus size={16} /> Gerar combinações
        </button>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-2 py-2">Tamanho</th>
                <th className="px-2 py-2">Cor</th>
                <th className="px-2 py-2">SKU / código *</th>
                <th className="px-2 py-2">Mínimo próprio</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="p-1">
                    <input aria-label="Tamanho" value={r.size} onChange={(e) => update(r.key, { size: e.target.value })} className={`${inputClass} w-24`} />
                  </td>
                  <td className="p-1">
                    <input aria-label="Cor" value={r.color} onChange={(e) => update(r.key, { color: e.target.value })} className={`${inputClass} min-w-32`} />
                  </td>
                  <td className="p-1">
                    <input
                      aria-label="SKU"
                      required
                      value={r.sku}
                      onChange={(e) => update(r.key, { sku: e.target.value.replace(/\s/g, "") })}
                      className={`${inputClass} min-w-40 font-mono`}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      aria-label="Mínimo próprio"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="do modelo"
                      value={r.minQuantity ?? ""}
                      onChange={(e) =>
                        update(r.key, {
                          minQuantity: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className={`${inputClass} w-28`}
                    />
                  </td>
                  <td className="p-1">
                    <button
                      type="button"
                      aria-label="Remover variação"
                      onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                      className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={suggestSkus} className={buttonClass.ghost}>
              <Wand2 size={16} /> Sugerir SKUs vazios
            </button>
            <button
              type="button"
              onClick={() => setRows([...rows, { key: nextKey++, sku: "", size: "", color: "" }])}
              className={buttonClass.ghost}
            >
              <Plus size={16} /> Linha manual
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductForm({
  product,
  categories,
  suppliers,
}: {
  product?: Product;
  categories: Category[];
  suppliers: Supplier[];
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(saveProduct);
  const [rows, setRows] = useState<Row[]>([]);
  const [reference, setReference] = useState(product?.reference ?? "");
  const activeCategories = categories.filter(
    (c) => c.active || c.id === product?.categoryId,
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
      {product && <input type="hidden" name="id" value={product.id} />}
      {!product && (
        <input
          type="hidden"
          name="variants"
          value={JSON.stringify(rows.map((r) => ({
            sku: r.sku,
            size: r.size,
            color: r.color,
            minQuantity: r.minQuantity ?? undefined,
          })))}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Referência *" htmlFor="reference" hint="Código do modelo (preserva zeros à esquerda)">
          <input
            id="reference"
            name="reference"
            required
            maxLength={30}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Nome do produto *" htmlFor="name" className="sm:col-span-2">
          <input id="name" name="name" required maxLength={150} defaultValue={product?.name} className={inputClass} />
        </Field>
        <Field label="Categoria" htmlFor="categoryId">
          <select id="categoryId" name="categoryId" defaultValue={product?.categoryId ?? ""} className={inputClass}>
            <option value="">Sem categoria</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fornecedor" htmlFor="supplierName">
          <input
            id="supplierName"
            name="supplierName"
            list="suppliers"
            maxLength={150}
            defaultValue={product?.supplier?.name}
            className={inputClass}
          />
          <datalist id="suppliers">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Coleção" htmlFor="collection" hint="Ex.: 2025 VERÃO">
          <input id="collection" name="collection" maxLength={60} defaultValue={product?.collection ?? ""} className={inputClass} />
        </Field>
        <Field label="Linha / modelagem" htmlFor="fit" hint="Ex.: SLIM, COMFORT">
          <input id="fit" name="fit" maxLength={60} defaultValue={product?.fit ?? ""} className={inputClass} />
        </Field>
        <Field label="Preço de venda (R$)" htmlFor="salePrice">
          <input
            id="salePrice"
            name="salePrice"
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]{1,2})?"
            title="Ex.: 199,90"
            defaultValue={product ? product.salePrice.replace(".", ",") : ""}
            className={inputClass}
          />
        </Field>
        <Field label="Estoque mínimo por SKU" htmlFor="minQuantity" hint="Alerta de estoque baixo (0 = sem alerta)">
          <input
            id="minQuantity"
            name="minQuantity"
            type="number"
            min={0}
            step={1}
            defaultValue={product?.minQuantity ?? 0}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-3">
          <label htmlFor="description" className={labelClass}>
            Descrição
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            maxLength={1000}
            defaultValue={product?.description ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      {!product && <VariantGrid rows={rows} setRows={setRows} reference={reference} />}

      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "Salvando..." : product ? "Salvar alterações" : `Cadastrar produto${rows.length ? ` e ${rows.length} variação(ões)` : ""}`}
        </button>
        <Link href={product ? `/produtos/${product.id}` : "/produtos"} className={buttonClass.secondary}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
