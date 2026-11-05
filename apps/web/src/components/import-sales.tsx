"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, XCircle } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import {
  confirmSalesImport,
  previewSalesImport,
} from "@/lib/sales-actions";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import { safeCall } from "@/lib/network";
import type { SalesImportResult, SalesIssue, SalesPreview } from "@/lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import { buttonClass, Card } from "./ui";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

function Issues({ issues, tone }: { issues: SalesIssue[]; tone: "error" | "warning" }) {
  return (
    <ul className={`max-h-60 space-y-1 overflow-y-auto text-sm ${tone === "error" ? "text-red-700" : "text-amber-800"}`}>
      {issues.map((issue, i) => (
        <li key={i}>
          {issue.line && <span className="font-mono text-xs text-neutral-500">linha {issue.line} · </span>}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

const day = (iso: string) => formatDate(`${iso.slice(0, 10)}T12:00:00`);

// Histórico de vendas: escolhe o relatório "vendas por cupom", vê a prévia
// (nada é gravado) e confirma. A importação não altera o estoque.
export function ImportSales() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<SalesPreview | null>(null);
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [error, setError] = useState<{ message: string; issues?: SalesIssue[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const formData = () => {
    const data = new FormData();
    const file = fileRef.current?.files?.[0];
    if (file) data.set("file", file);
    return data;
  };

  function runPreview() {
    setError(null);
    setPreview(null);
    startTransition(async () => {
      const response = await safeCall(() => previewSalesImport(formData()));
      if ("error" in response) setError({ message: response.error, issues: "errors" in response ? response.errors : undefined });
      else setPreview(response.data);
    });
  }

  function runImport() {
    if (!preview) return;
    startTransition(async () => {
      const response = await safeCall(() => confirmSalesImport(formData(), preview.fileHash));
      setConfirming(false);
      if ("error" in response) setError({ message: response.error, issues: "errors" in response ? response.errors : undefined });
      else setResult(response.data);
    });
  }

  if (result) {
    return (
      <Card>
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 size={36} className="text-emerald-600" />
          <p className="mt-3 text-lg font-bold">Vendas importadas</p>
          <p className="mt-1 text-sm text-neutral-500">
            {formatQuantity(result.lineCount)} linhas, {formatQuantity(result.pieces)} peças líquidas e{" "}
            {formatCurrency(result.total)} de {day(result.periodFrom)} a {day(result.periodTo)}. O estoque não
            foi alterado.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-64 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-4 py-3 hover:border-ink-800">
          <FileSpreadsheet size={22} className="text-neutral-500" />
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx"
            aria-label="Relatório vendas por cupom"
            onChange={() => {
              setPreview(null);
              setError(null);
            }}
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
          />
        </label>
        <button type="button" onClick={runPreview} disabled={pending} className={buttonClass.primary}>
          {pending && !preview ? "Lendo..." : "Gerar prévia"}
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Relatório &quot;vendas por cupom&quot; do ERP (.xls ou .xlsx, até 10 MB). A prévia não grava nada. CPF e
        celular de clientes, se existirem na planilha, não são lidos.
      </p>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-red-700">
            <XCircle size={18} /> {error.message}
          </p>
          {error.issues && error.issues.length > 0 && (
            <div className="mt-3">
              <Issues issues={error.issues} tone="error" />
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Período {preview.periodFrom ? day(preview.periodFrom) : "?"} a {preview.periodTo ? day(preview.periodTo) : "?"}
            {preview.store ? ` · loja ${preview.store}` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Peças líquidas"
              value={formatQuantity(preview.totals.pieces)}
              hint={`${formatQuantity(preview.totals.sold)} vendidas − ${formatQuantity(Math.abs(preview.totals.returned))} devolvidas`}
            />
            <Stat
              label="Valor"
              value={formatCurrency(preview.totals.total)}
              hint={
                preview.reportTotals.total !== null
                  ? `TOTAL GERAL do relatório: ${formatCurrency(preview.reportTotals.total)}`
                  : undefined
              }
            />
            <Stat label="Linhas" value={formatQuantity(preview.lineCount)} hint={`${preview.sellers} vendedor(es)`} />
            <Stat label="Desconto" value={formatCurrency(preview.totals.discount)} hint={`custo ${formatCurrency(preview.totals.cost)}`} />
          </div>
          <p className="text-xs text-neutral-500">Colunas lidas: {preview.columns.join(", ")}</p>

          {preview.errorCount > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-2 font-semibold text-red-700">
                {preview.errorCount} problema(s) que impedem a importação
              </p>
              <Issues issues={preview.errors} tone="error" />
            </div>
          )}
          {preview.warningCount > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 flex items-center gap-2 font-semibold text-amber-800">
                <AlertTriangle size={16} /> {preview.warningCount} aviso(s)
              </p>
              <Issues issues={preview.warnings} tone="warning" />
            </div>
          )}

          <button
            type="button"
            disabled={!preview.canImport || pending}
            onClick={() => setConfirming(true)}
            className={buttonClass.primary}
          >
            Importar {formatQuantity(preview.lineCount)} linhas
          </button>
          {!preview.canImport && (
            <p className="text-sm text-red-700">Corrija os problemas acima e gere a prévia de novo.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Importar o histórico de vendas?"
        confirmLabel="Importar"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={runImport}
      >
        {preview && (
          <p>
            {formatQuantity(preview.lineCount)} linhas de venda entram só para análise (giro, mix de tamanhos,
            margem). O estoque não é alterado, e a importação pode ser removida depois.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
