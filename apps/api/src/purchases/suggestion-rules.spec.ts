import { DEFAULT_PARAMS, suggest, type DemandInput } from './suggestion-rules';

const P = DEFAULT_PARAMS; // 90 dias de janela, 15 de prazo, 30 de cobertura
const base: DemandInput = {
  quantity: 10,
  minQuantity: 0,
  sold: 0,
  saleOperations: 0,
  historyDays: 90,
  onOrder: 0,
};
const run = (over: Partial<DemandInput>, params = P) =>
  suggest({ ...base, ...over }, params);

describe('suggest', () => {
  it('calcula a quantidade pela meta de prazo + cobertura', () => {
    // 45 peças em 90 dias = 0,5/dia; meta 0,5 x 45 = 23 (arredondado para cima);
    // estoque 10 => comprar 13.
    const s = run({ sold: 45, saleOperations: 20 });
    expect(s.reliable).toBe(true);
    expect(s.dailyRate).toBeCloseTo(0.5);
    expect(s.suggested).toBe(13);
    expect(s.classification).toBe('REPLENISH');
    expect(s.reason).toContain('Sugestão: 13 peças');
  });

  it('soma o estoque mínimo à meta', () => {
    const s = run({ sold: 45, saleOperations: 20, minQuantity: 4 });
    expect(s.suggested).toBe(17);
  });

  it('desconta o que já está a caminho em pedidos abertos', () => {
    const s = run({ sold: 45, saleOperations: 20, onOrder: 13 });
    expect(s.suggested).toBe(0);
    expect(s.classification).toBe('OK');
    expect(s.reason).toContain('13 peças em pedidos abertos');
  });

  it('marca como crítico o que está zerado e vende', () => {
    const s = run({ quantity: 0, sold: 30, saleOperations: 10 });
    expect(s.classification).toBe('CRITICAL');
    expect(s.suggested).toBeGreaterThan(0);
  });

  it('marca como crítico o que acaba antes do prazo de entrega', () => {
    // 1 peça/dia, estoque 5 dura 5 dias (< 15 de prazo).
    const s = run({ quantity: 5, sold: 90, saleOperations: 40 });
    expect(s.classification).toBe('CRITICAL');
  });

  it('não sugere nada quando há estoque de sobra', () => {
    const s = run({ quantity: 50, sold: 45, saleOperations: 20 });
    expect(s.suggested).toBe(0);
    expect(s.classification).toBe('OK');
  });

  it('detecta excesso: estoque dura mais que o limite', () => {
    // 0,1/dia, estoque 100 dura 1000 dias.
    const s = run({ quantity: 100, sold: 9, saleOperations: 5 });
    expect(s.classification).toBe('EXCESS');
    expect(s.suggested).toBe(0);
  });

  it('detecta produto parado: estoque e nenhuma venda na janela', () => {
    const s = run({ quantity: 8, sold: 0, saleOperations: 0 });
    expect(s.classification).toBe('STALE');
    expect(s.reason).toContain('parado');
  });

  it('não chama de parado o que acabou de ser cadastrado', () => {
    const s = run({ quantity: 8, historyDays: 3 });
    expect(s.classification).toBe('INSUFFICIENT');
    expect(s.suggested).toBeNull();
  });

  it('não inventa número com poucas vendas, mas avisa o déficit do mínimo', () => {
    const s = run({
      quantity: 1,
      minQuantity: 3,
      sold: 2,
      saleOperations: 2,
    });
    expect(s.reliable).toBe(false);
    expect(s.classification).toBe('BELOW_MIN');
    expect(s.suggested).toBeNull();
    expect(s.minShortfall).toBe(2);
    expect(s.reason).toContain('Histórico insuficiente');
  });

  it('abaixo do mínimo sem histórico considera o que já foi pedido', () => {
    const s = run({
      quantity: 1,
      minQuantity: 3,
      saleOperations: 1,
      sold: 1,
      onOrder: 5,
    });
    expect(s.classification).toBe('BELOW_MIN');
    expect(s.minShortfall).toBe(0);
  });

  it('exige dias de histórico mesmo com várias vendas', () => {
    const s = run({ sold: 10, saleOperations: 10, historyDays: 5 });
    expect(s.reliable).toBe(false);
    expect(s.suggested).toBeNull();
  });

  it('limita os dias observados à janela de análise', () => {
    const s = run({ sold: 45, saleOperations: 20, historyDays: 500 });
    expect(s.observedDays).toBe(90);
  });

  it('respeita parâmetros configurados', () => {
    const s = run(
      { sold: 45, saleOperations: 20 },
      { ...P, leadTimeDays: 30, coverDays: 60 },
    );
    // 0,5 x 90 = 45 - 10 = 35
    expect(s.suggested).toBe(35);
  });

  it('nunca sugere quantidade negativa', () => {
    const s = run({ quantity: 1000, sold: 45, saleOperations: 20 });
    expect(s.suggested).toBe(0);
  });
});
