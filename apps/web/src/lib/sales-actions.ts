"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { api, ApiError, apiRaw } from "./api";
import type { FormState, SalesImportResult, SalesIssue, SalesPreview } from "./types";

// Mesmas regras de lib/actions.ts: a autorização de verdade fica na API.

type Outcome<T> = { data: T } | { error: string; errors?: SalesIssue[] };

async function send<T>(
  path: string,
  formData: FormData,
  fields: Record<string, string> = {},
): Promise<Outcome<T>> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Escolha o relatório (.xls ou .xlsx)." };
  }
  const body = new FormData();
  body.set("file", file, file.name);
  for (const [key, value] of Object.entries(fields)) body.set(key, value);

  let response: Response;
  try {
    response = await apiRaw(path, { method: "POST", body });
  } catch (error) {
    unstable_rethrow(error);
    return { error: "Não foi possível falar com a API. Ela está rodando?" };
  }
  const data = (await response.json().catch(() => null)) as
    | (T & { message?: string | string[]; errors?: SalesIssue[] })
    | null;
  if (response.status === 413) return { error: "Arquivo grande demais (máximo de 10 MB)." };
  if (response.status === 403) {
    return { error: "Só administrador e gerente importam o histórico de vendas." };
  }
  if (!response.ok || !data) {
    const message = Array.isArray(data?.message) ? data.message.join("; ") : data?.message;
    return { error: message ?? "Não foi possível ler o relatório.", errors: data?.errors };
  }
  return { data };
}

export async function previewSalesImport(formData: FormData) {
  return send<SalesPreview>("/sales-history/import/preview", formData);
}

export async function confirmSalesImport(formData: FormData, fileHash: string) {
  const result = await send<SalesImportResult>("/sales-history/import", formData, { fileHash });
  if ("data" in result) revalidatePath("/compras", "layout");
  return result;
}

export async function deleteSalesImport(id: string): Promise<FormState> {
  try {
    await api.delete(`/sales-history/imports/${id}`);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof ApiError ? error.message : "Não foi possível remover." };
  }
  revalidatePath("/compras", "layout");
  return { success: "Importação removida." };
}
