"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { api, ApiError } from "./api";
import type { FormState, PurchaseOrder } from "./types";

// Mesmas regras de lib/actions.ts: a autorização de verdade fica na API.

function failure(error: unknown): string {
  unstable_rethrow(error);
  if (error instanceof ApiError) return error.message;
  return "Não foi possível falar com a API. Ela está rodando?";
}

// A tela de compras e o estoque mudam juntos (recebimento gera entrada).
function revalidate() {
  revalidatePath("/", "layout");
}

export interface PurchaseItemInput {
  variantId: string;
  quantity: number;
  unitCost?: number;
}

export interface PurchaseOrderInput {
  supplierId?: string;
  notes?: string;
  expectedAt?: string;
  status?: "DRAFT" | "PENDING";
  idempotencyKey: string;
  items: PurchaseItemInput[];
}

export type OrderResult = { error: string } | { order: Pick<PurchaseOrder, "id" | "number" | "status"> };

export async function createPurchaseOrder(input: PurchaseOrderInput): Promise<OrderResult> {
  try {
    const order = await api.post<PurchaseOrder>("/purchase-orders", input);
    revalidate();
    return { order: { id: order.id, number: order.number, status: order.status } };
  } catch (error) {
    return { error: failure(error) };
  }
}

export async function updatePurchaseOrder(
  id: string,
  input: {
    supplierId: string | null;
    notes: string | null;
    expectedAt: string | null;
    items: PurchaseItemInput[];
  },
): Promise<OrderResult> {
  try {
    const order = await api.patch<PurchaseOrder>(`/purchase-orders/${id}`, input);
    revalidate();
    return { order: { id: order.id, number: order.number, status: order.status } };
  } catch (error) {
    return { error: failure(error) };
  }
}

export async function changePurchaseStatus(
  id: string,
  status: "PENDING" | "SENT" | "CANCELLED",
): Promise<FormState> {
  try {
    await api.post(`/purchase-orders/${id}/status`, { status });
  } catch (error) {
    return { error: failure(error) };
  }
  revalidate();
  return { success: "Status atualizado." };
}

export async function receivePurchaseOrder(
  id: string,
  input: {
    idempotencyKey: string;
    occurredAt?: string;
    notes?: string;
    items: { itemId: string; quantity: number; unitCost?: number }[];
  },
): Promise<FormState> {
  try {
    await api.post(`/purchase-orders/${id}/receive`, input);
  } catch (error) {
    return { error: failure(error) };
  }
  revalidate();
  return { success: "Recebimento registrado: o estoque já foi atualizado." };
}

// Cria um rascunho por fornecedor e abre o primeiro (ou a lista, se vários).
export async function createDraftsFromSuggestions(input: {
  idempotencyKey: string;
  items: PurchaseItemInput[];
}): Promise<FormState> {
  let orders: PurchaseOrder[];
  try {
    orders = await api.post<PurchaseOrder[]>("/purchase-orders/from-suggestions", input);
  } catch (error) {
    return { error: failure(error) };
  }
  revalidate();
  redirect(
    orders.length === 1
      ? `/compras/pedidos/${orders[0].id}`
      : "/compras/pedidos?status=DRAFT",
  );
}

export async function savePurchaseSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const num = (name: string) => Number(String(formData.get(name) ?? "").trim());
  try {
    await api.put("/purchases/settings", {
      analysisDays: num("analysisDays"),
      leadTimeDays: num("leadTimeDays"),
      coverDays: num("coverDays"),
      minSales: num("minSales"),
      minHistoryDays: num("minHistoryDays"),
      excessDays: num("excessDays"),
    });
  } catch (error) {
    return { error: failure(error) };
  }
  revalidate();
  return { success: "Parâmetros salvos." };
}
