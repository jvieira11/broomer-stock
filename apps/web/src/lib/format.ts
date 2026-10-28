import type { OperationType, StockStatus } from "./types";

const TIME_ZONE = "America/Maceio";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

// Custo médio pode ter até 4 casas; mostra no mínimo 2, como dinheiro.
const preciseCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 4,
});

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});

const dateOnly = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: TIME_ZONE,
});

export const formatCurrency = (value: string | number) =>
  currency.format(Number(value));

export const formatUnitCost = (value: string | number) =>
  preciseCurrency.format(Number(value));

export const formatQuantity = (value: string | number) =>
  integer.format(Number(value));

export const formatSigned = (value: number) =>
  value > 0 ? `+${formatQuantity(value)}` : formatQuantity(value);

export const formatDateTime = (value: string) => dateTime.format(new Date(value));

export const formatDate = (value: string) => dateOnly.format(new Date(value));

// "2026-10-28" → "28/10" (eixo do gráfico), sem passar por fuso horário.
export const formatDay = (day: string) => {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
};

// Data de hoje (AAAA-MM-DD) no fuso da loja, deslocada em `days` dias.
export function localDate(days = 0) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

// Valor para <input type="datetime-local"> no fuso da loja.
export function localDateTimeInput(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Tamanho e cor: "" significa que não se aplica.
export const variantLabel = (variant: { size: string; color: string }) =>
  [variant.size, variant.color].filter(Boolean).join(" · ") || "Tamanho único";

export const operationLabels: Record<OperationType, string> = {
  ENTRY: "Entrada",
  SALE: "Venda",
  CUSTOMER_RETURN: "Devolução de cliente",
  SUPPLIER_RETURN: "Devolução ao fornecedor",
  LOSS: "Perda/avaria",
  INVENTORY: "Ajuste de inventário",
  REVERSAL: "Estorno",
  INITIAL_LOAD: "Carga inicial",
};

export const operationDescriptions: Partial<Record<OperationType, string>> = {
  ENTRY: "Mercadoria recebida. Soma ao estoque.",
  SALE: "Peças vendidas. Baixa do estoque.",
  CUSTOMER_RETURN: "Cliente devolveu a peça. Volta ao estoque.",
  SUPPLIER_RETURN: "Peças devolvidas ao fornecedor. Baixa do estoque.",
  LOSS: "Peça perdida, danificada ou extraviada. Baixa do estoque.",
  INVENTORY: "Contagem física: informe quantas peças existem de fato.",
};

export const statusLabels: Record<StockStatus, string> = {
  OUT: "Sem estoque",
  LOW: "Estoque baixo",
  NORMAL: "Normal",
};
