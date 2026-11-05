// Regra de sugestão de compra, por variação (tamanho e cor). Função pura: o
// serviço busca os números no banco e passa para cá, o que deixa a regra
// testável e igual em todas as telas.
//
// Resumo (detalhes em COMPRAS.md):
//   ritmo        = peças vendidas na janela / dias observados
//   cobertura    = estoque atual / ritmo           (em dias)
//   meta         = ritmo x (prazo de entrega + dias de cobertura) + estoque mínimo
//   sugerido     = meta - estoque atual - já pedido e a caminho   (nunca negativo)
// Só há sugestão numérica quando o histórico é confiável (vendas e dias
// suficientes). Sem isso, o sistema diz que faltam dados em vez de inventar.

export interface PurchaseParams {
  // Janela de vendas analisada (dias).
  analysisDays: number;
  // Dias entre pedir e a mercadoria chegar.
  leadTimeDays: number;
  // Dias de vendas que a compra deve cobrir depois da chegada.
  coverDays: number;
  // Mínimo de operações de venda e de dias de histórico para confiar no ritmo.
  minSales: number;
  minHistoryDays: number;
  // Cobertura acima disto (dias) é excesso de estoque.
  excessDays: number;
}

export const DEFAULT_PARAMS: PurchaseParams = {
  analysisDays: 90,
  leadTimeDays: 15,
  coverDays: 30,
  minSales: 3,
  minHistoryDays: 14,
  excessDays: 180,
};

export interface DemandInput {
  quantity: number;
  // Estoque mínimo (alerta já existente no sistema); 0 = sem mínimo.
  minQuantity: number;
  // Peças vendidas na janela, sem as vendas estornadas.
  sold: number;
  // Quantas vendas (operações) deram essas peças.
  saleOperations: number;
  // Dias desde o primeiro registro da variação (limitado à janela depois).
  historyDays: number;
  // Pedidos em aberto: pedido - recebido (PENDENTE, ENVIADO, PARC. RECEBIDO).
  onOrder: number;
}

export type Classification =
  // Zerado ou acaba antes de um pedido novo chegar, e há procura.
  | 'CRITICAL'
  // Precisa repor: a meta é maior que o estoque + o que já está a caminho.
  | 'REPLENISH'
  // Abaixo do mínimo, mas sem histórico confiável para dizer quanto comprar.
  | 'BELOW_MIN'
  // Sem dados suficientes para recomendar.
  | 'INSUFFICIENT'
  // Tem estoque e não vendeu nada na janela (com histórico suficiente).
  | 'STALE'
  // Estoque dura mais que o limite de excesso, no ritmo atual.
  | 'EXCESS'
  | 'OK';

export interface Suggestion {
  classification: Classification;
  // null = sem dados confiáveis (não há número a mostrar).
  suggested: number | null;
  // Para BELOW_MIN: peças que faltam para chegar ao estoque mínimo.
  minShortfall: number | null;
  reliable: boolean;
  // Peças por dia; null quando não há histórico confiável.
  dailyRate: number | null;
  // Dias que o estoque atual dura; null sem ritmo.
  coverageDays: number | null;
  observedDays: number;
  reason: string;
}

const fmt = (n: number, digits = 1) =>
  n.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

const pieces = (n: number) => `${fmt(n, 0)} ${n === 1 ? 'peça' : 'peças'}`;

export function suggest(
  input: DemandInput,
  params: PurchaseParams,
): Suggestion {
  const observedDays = Math.max(
    1,
    Math.min(params.analysisDays, Math.floor(input.historyDays)),
  );
  const reliable =
    input.saleOperations >= params.minSales &&
    observedDays >= params.minHistoryDays;
  const available = input.quantity + input.onOrder;
  const base = { reliable, observedDays };
  const onOrderNote =
    input.onOrder > 0
      ? ` Já há ${pieces(input.onOrder)} em pedidos abertos.`
      : '';

  if (!reliable) {
    const sales = `${input.saleOperations} ${input.saleOperations === 1 ? 'venda' : 'vendas'} em ${observedDays} ${observedDays === 1 ? 'dia' : 'dias'}`;
    // Procura zero numa janela observada por tempo suficiente: parado.
    if (
      input.sold === 0 &&
      input.quantity > 0 &&
      observedDays >= params.minHistoryDays
    ) {
      return {
        ...base,
        classification: 'STALE',
        suggested: 0,
        minShortfall: null,
        dailyRate: 0,
        coverageDays: null,
        reason: `Sem vendas nos últimos ${observedDays} dias e ${pieces(input.quantity)} em estoque: está parado.`,
      };
    }
    if (input.minQuantity > 0 && input.quantity <= input.minQuantity) {
      const shortfall = Math.max(0, input.minQuantity - available);
      return {
        ...base,
        classification: 'BELOW_MIN',
        suggested: null,
        minShortfall: shortfall,
        dailyRate: null,
        coverageDays: null,
        reason: `Estoque ${input.quantity} (mínimo ${input.minQuantity}). Histórico insuficiente para calcular a quantidade (${sales}; são necessárias ${params.minSales} vendas e ${params.minHistoryDays} dias). Faltam ${pieces(shortfall)} para chegar ao mínimo.${onOrderNote}`,
      };
    }
    return {
      ...base,
      classification: 'INSUFFICIENT',
      suggested: null,
      minShortfall: null,
      dailyRate: null,
      coverageDays: null,
      reason: `Histórico insuficiente para recomendar (${sales}; são necessárias ${params.minSales} vendas e ${params.minHistoryDays} dias).`,
    };
  }

  const dailyRate = input.sold / observedDays;
  const coverageDays = dailyRate > 0 ? input.quantity / dailyRate : null;
  const horizon = params.leadTimeDays + params.coverDays;
  const target = Math.ceil(dailyRate * horizon) + input.minQuantity;
  const suggested = Math.max(0, target - available);

  const common = `Vendeu ${pieces(input.sold)} em ${observedDays} dias (${fmt(dailyRate, 2)} por dia).`;

  if (suggested > 0) {
    const runsOutBeforeArrival =
      input.quantity <= 0 ||
      (coverageDays !== null && coverageDays < params.leadTimeDays);
    const minPart =
      input.minQuantity > 0 ? ` + mínimo ${input.minQuantity}` : '';
    return {
      ...base,
      classification: runsOutBeforeArrival ? 'CRITICAL' : 'REPLENISH',
      suggested,
      minShortfall: null,
      dailyRate,
      coverageDays,
      reason: `${common} Estoque ${input.quantity}${coverageDays !== null ? ` dura ~${fmt(coverageDays, 0)} dias` : ''}${runsOutBeforeArrival ? `, menos que o prazo de entrega (${params.leadTimeDays} dias)` : ''}. Meta para ${horizon} dias (${params.leadTimeDays} de prazo + ${params.coverDays} de cobertura): ${target} peças${minPart}.${onOrderNote} Sugestão: ${pieces(suggested)}.`,
    };
  }

  if (coverageDays !== null && coverageDays > params.excessDays) {
    return {
      ...base,
      classification: 'EXCESS',
      suggested: 0,
      minShortfall: null,
      dailyRate,
      coverageDays,
      reason: `${common} Estoque ${input.quantity} dura ~${fmt(coverageDays, 0)} dias, mais que o limite de ${params.excessDays}: excesso, não comprar.`,
    };
  }

  return {
    ...base,
    classification: 'OK',
    suggested: 0,
    minShortfall: null,
    dailyRate,
    coverageDays,
    reason: `${common} Estoque ${input.quantity}${coverageDays !== null ? ` dura ~${fmt(coverageDays, 0)} dias` : ''}.${onOrderNote} Não precisa comprar agora.`,
  };
}

// Ordem de atenção nas listas: o mais urgente primeiro.
export const CLASSIFICATION_ORDER: Classification[] = [
  'CRITICAL',
  'REPLENISH',
  'BELOW_MIN',
  'STALE',
  'EXCESS',
  'INSUFFICIENT',
  'OK',
];

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  CRITICAL: 'Crítico',
  REPLENISH: 'Repor',
  BELOW_MIN: 'Abaixo do mínimo',
  STALE: 'Parado',
  EXCESS: 'Excesso',
  INSUFFICIENT: 'Sem dados',
  OK: 'Em dia',
};
