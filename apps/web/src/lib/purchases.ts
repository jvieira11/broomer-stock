import type { Classification, PurchaseStatus } from "./types";

export const classificationLabels: Record<Classification, string> = {
  CRITICAL: "Crítico",
  REPLENISH: "Repor",
  BELOW_MIN: "Abaixo do mínimo",
  STALE: "Parado",
  EXCESS: "Excesso",
  INSUFFICIENT: "Sem dados",
  OK: "Em dia",
};

export const classificationTones: Record<
  Classification,
  "danger" | "warning" | "info" | "neutral" | "success"
> = {
  CRITICAL: "danger",
  REPLENISH: "warning",
  BELOW_MIN: "warning",
  STALE: "neutral",
  EXCESS: "info",
  INSUFFICIENT: "neutral",
  OK: "success",
};

export const purchaseStatusLabels: Record<PurchaseStatus, string> = {
  DRAFT: "Rascunho",
  PENDING: "Pendente",
  SENT: "Enviado ao fornecedor",
  PARTIALLY_RECEIVED: "Parcialmente recebido",
  RECEIVED: "Recebido",
  CANCELLED: "Cancelado",
};

export const purchaseStatusTones: Record<
  PurchaseStatus,
  "neutral" | "info" | "warning" | "success" | "danger" | "dark"
> = {
  DRAFT: "neutral",
  PENDING: "info",
  SENT: "dark",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  CANCELLED: "danger",
};

// Pedidos nestes status ainda esperam mercadoria.
export const OPEN_STATUSES: PurchaseStatus[] = ["PENDING", "SENT", "PARTIALLY_RECEIVED"];
