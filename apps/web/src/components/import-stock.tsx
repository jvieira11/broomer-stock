"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, XCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  confirmImport,
  type ImportIssue,
  type ImportPreview,
  type ImportResult,
  previewImport,
} from "@/lib/actions";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import { safeCall } from "@/lib/network";
import { ConfirmDialog } from "./confirm-dialog";
import { Badge, buttonClass, Card, cellClass, Table } from "./ui";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

function IssueList({ issues, tone }: { issues: ImportIssue[]; tone: "error" | "warning" }) {
  return (
    <ul className={`max-h-72 space-y-1 overflow-y-auto text-sm ${tone === "error" ? "text-red-700" : "text-amber-800"}`}>
      {issues.map((issue, i) => (
        <li key={i}>
          {issue.line && <span className="font-mono text-xs text-neutral-500">linha {issue.line} · </span>}
          {issue.sku && <span className="font-mono text-xs">{issue.sku} · </span>}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

// Carga inicial: escolhe o relatório, vê a prévia (nada é gravado) e confirma.
export function ImportStock() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<{ message: string; issues?: ImportIssue[] } | null>(null);
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
      const response = await safeCall(() => previewImport(formData()));
      if ("error" in response) setError({ message: response.error, issues: response.errors });
      else setPreview(response.data);
    });
  }

  function runImport() {
    if (!preview) return;
    startTransition(async () => {
      const response = await safeCall(() => confirmImport(formData(), preview.fileHash));
      setConfirming(false);
      if ("error" in response) setError({ message: response.error, issues: response.errors });
      else setResult(response.data);
    });
  }

  if (result) {
    return (
      <Card>
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle2 size={40} className="text-emerald-600" />
          <p className="mt-3 text-lg font-bold">Estoque importado</p>
          <p className="mt-1 text-sm text-neutral-500">
            {formatQuantity(result.products)} modelos, {formatQuantity(result.variants)} SKUs e{" "}
            {formatQuantity(result.pieces)} peças. {result.categoriesCreated} categoria(s) e{" "}
            {result.suppliersCreated} fornecedor(es) criados.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/estoque" className={buttonClass.primary}>
              Ver estoque
            </Link>
            <Link href={`/movimentacoes/${result.operation.id}`} className={buttonClass.secondary}>
              Carga inicial #{result.operation.number}
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card title="1. Escolha o relatório">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-4 py-3 hover:border-ink-800">
            <FileSpreadsheet size={22} className="text-neutral-500" />
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx"
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
        <p className="mt-3 text-xs text-neutral-500">
          Relatório &quot;estoque final do dia&quot; exportado pelo ERP (.xls ou .xlsx, até 10 MB). A prévia
          não grava nada.
        </p>
      </Card>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-red-700">
            <XCircle size={18} /> {error.message}
          </p>
          {error.issues && error.issues.length > 0 && (
            <div className="mt-3">
              <IssueList issues={error.issues} tone="error" />
            </div>
          )}
        </div>
      )}

      {preview && (
        <>
          <Card
            title="2. Confira a prévia"
            description={`Estoque de ${preview.reportDate ? formatDate(`${preview.reportDate}T12:00:00`) : "data não informada"}${preview.store ? ` · loja ${preview.store}` : ""}`}
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Modelos" value={formatQuantity(preview.totals.models)} hint="por referência" />
              <Stat
                label="SKUs"
                value={formatQuantity(preview.totals.variants)}
                hint={`${formatQuantity(preview.totals.withStock)} com saldo · ${formatQuantity(preview.totals.zero)} zerados`}
              />
              <Stat
                label="Peças"
                value={formatQuantity(preview.totals.pieces)}
                hint={preview.totals.reportTotal !== null ? `total do relatório: ${formatQuantity(preview.totals.reportTotal)}` : undefined}
              />
              <Stat label="Saldos negativos" value={preview.totals.negative} hint="entram como 0" />
            </div>
            <ul className="mt-4 space-y-1 text-sm text-neutral-600">
              <li>
                {preview.categories.length} categorias pela primeira palavra da descrição ·{" "}
                {preview.totals.suppliers} fornecedores
              </li>
              <li>
                {preview.totals.priceOverrides} SKU(s) com preço diferente do modelo (o preço mais comum
                vira o do modelo)
              </li>
              {preview.totals.withoutPrice > 0 && (
                <li>{preview.totals.withoutPrice} SKU(s) sem preço no relatório (entram com o preço do modelo)</li>
              )}
              {preview.totals.withoutCost > 0 && (
                <li>{preview.totals.withoutCost} SKU(s) com saldo e sem custo (custo médio 0)</li>
              )}
              <li className="text-xs text-neutral-400">Colunas lidas: {preview.columns.join(", ")}</li>
            </ul>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Categorias" flush>
              <div className="flex flex-wrap gap-2 p-4">
                {preview.categories.map((c) => (
                  <Badge key={c.name}>
                    {c.name} · {c.models}
                  </Badge>
                ))}
              </div>
            </Card>
            <Card title="Padronizações" description="Grafias unificadas antes de gravar" flush>
              {preview.normalizations.length === 0 ? (
                <p className="p-4 text-sm text-neutral-500">Nenhuma.</p>
              ) : (
                <Table head={["Campo", "No relatório", "Fica", "Linhas"]}>
                  {preview.normalizations.map((n, i) => (
                    <tr key={i}>
                      <td className={cellClass}>{n.field}</td>
                      <td className={`${cellClass} font-mono text-xs`}>{n.from || "(vazio)"}</td>
                      <td className={`${cellClass} font-mono text-xs`}>{n.to || "não se aplica"}</td>
                      <td className={cellClass}>{n.count}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </div>

          {preview.errorCount > 0 && (
            <Card title={`${preview.errorCount} problema(s) que impedem a importação`}>
              <IssueList issues={preview.errors} tone="error" />
            </Card>
          )}
          {preview.warningCount > 0 && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600" /> {preview.warningCount} aviso(s) para
                  conferir depois
                </span>
              }
            >
              <IssueList issues={preview.warnings} tone="warning" />
            </Card>
          )}

          <Card title="Amostra" description="Primeiros modelos como ficarão no sistema" flush>
            <Table head={["Referência", "Produto", "Categoria", "Preço", "Variações"]}>
              {preview.sample.map((m) => (
                <tr key={m.reference}>
                  <td className={`${cellClass} font-mono text-xs`}>{m.reference}</td>
                  <td className={`${cellClass} max-w-72 truncate`}>{m.name}</td>
                  <td className={cellClass}>{m.category ?? "—"}</td>
                  <td className={cellClass}>{formatCurrency(m.salePrice)}</td>
                  <td className={`${cellClass} whitespace-normal text-xs text-neutral-600`}>
                    {m.variants
                      .map((v) => `${[v.size, v.color].filter(Boolean).join("/") || "único"} (${v.quantity})`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="3. Importar">
            <p className="text-sm text-neutral-600">
              Cria os modelos, os SKUs, as categorias e os fornecedores, e registra os saldos como uma
              operação de <strong>carga inicial</strong> com a data do relatório. Referências ou SKUs já
              cadastrados impedem a importação, para nada ser sobrescrito.
            </p>
            <button
              type="button"
              disabled={!preview.canImport || pending}
              onClick={() => setConfirming(true)}
              className={`${buttonClass.primary} mt-4`}
            >
              Importar {formatQuantity(preview.totals.variants)} SKUs
            </button>
            {!preview.canImport && (
              <p className="mt-2 text-sm text-red-700">Corrija os problemas acima e gere a prévia de novo.</p>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        title="Importar o estoque?"
        confirmLabel="Importar"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={runImport}
      >
        {preview && (
          <p>
            {formatQuantity(preview.totals.models)} modelos, {formatQuantity(preview.totals.variants)} SKUs e{" "}
            {formatQuantity(preview.totals.pieces)} peças entram no sistema. A carga fica no histórico e
            pode ser estornada inteira se algo der errado.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
