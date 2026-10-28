import { BadRequestException } from '@nestjs/common';
import { MovementType, Prisma } from '../generated/prisma/client';
import { applyMovement, reversalOf, StockChange } from './stock-rules';

const d = (value: number | string) => new Prisma.Decimal(value);
const state = (quantity: number, averageCost: number | string = 0) => ({
  quantity,
  averageCost: d(averageCost),
});

// Compara custos como texto para não depender da representação do Decimal.
const asText = (change: StockChange) => ({
  delta: change.delta,
  balanceBefore: change.balanceBefore,
  balanceAfter: change.balanceAfter,
  unitCost: change.unitCost.toString(),
  averageCost: change.averageCost.toString(),
});

describe('applyMovement', () => {
  it('entrada soma ao saldo e recalcula o custo médio', () => {
    // (10 x 5 + 10 x 7) / 20 = 6
    expect(
      asText(applyMovement(state(10, 5), MovementType.IN, 10, d(7))),
    ).toEqual({
      delta: 10,
      balanceBefore: 10,
      balanceAfter: 20,
      unitCost: '7',
      averageCost: '6',
    });
  });

  it('entrada sem custo mantém o custo médio', () => {
    expect(asText(applyMovement(state(4, 2.5), MovementType.IN, 6))).toEqual({
      delta: 6,
      balanceBefore: 4,
      balanceAfter: 10,
      unitCost: '2.5',
      averageCost: '2.5',
    });
  });

  it('entrada com saldo zerado assume o custo da entrada', () => {
    expect(
      applyMovement(
        state(0, 9),
        MovementType.IN,
        3,
        d(4),
      ).averageCost.toString(),
    ).toBe('4');
  });

  it('custo médio é arredondado em 4 casas', () => {
    // (1 x 1 + 2 x 2) / 3 = 1,66666...
    expect(
      applyMovement(
        state(1, 1),
        MovementType.IN,
        2,
        d(2),
      ).averageCost.toString(),
    ).toBe('1.6667');
  });

  it('saída subtrai e registra o custo médio', () => {
    expect(asText(applyMovement(state(8, 3), MovementType.OUT, 3))).toEqual({
      delta: -3,
      balanceBefore: 8,
      balanceAfter: 5,
      unitCost: '3',
      averageCost: '3',
    });
  });

  it('saída pode zerar o saldo', () => {
    expect(applyMovement(state(2), MovementType.OUT, 2).balanceAfter).toBe(0);
  });

  it('bloqueia saída maior que o saldo', () => {
    expect(() => applyMovement(state(2), MovementType.OUT, 3)).toThrow(
      'Estoque insuficiente: disponível 2, solicitado 3',
    );
  });

  it('ajuste define o saldo pela contagem e registra a diferença', () => {
    expect(applyMovement(state(10), MovementType.ADJUSTMENT, 7)).toMatchObject({
      delta: -3,
      balanceAfter: 7,
    });
    expect(applyMovement(state(1), MovementType.ADJUSTMENT, 4)).toMatchObject({
      delta: 3,
      balanceAfter: 4,
    });
    expect(applyMovement(state(5), MovementType.ADJUSTMENT, 0)).toMatchObject({
      delta: -5,
      balanceAfter: 0,
    });
  });

  it('recusa ajuste sem diferença', () => {
    expect(() => applyMovement(state(5), MovementType.ADJUSTMENT, 5)).toThrow(
      BadRequestException,
    );
  });

  it.each([
    [MovementType.IN, 0],
    [MovementType.OUT, 0],
    [MovementType.IN, -1],
    [MovementType.ADJUSTMENT, -1],
  ])('recusa %s com quantidade %d', (type, quantity) => {
    expect(() => applyMovement(state(5), type, quantity)).toThrow(
      BadRequestException,
    );
  });

  it('recusa quantidade fracionada', () => {
    expect(() => applyMovement(state(5), MovementType.OUT, 1.5)).toThrow(
      'A quantidade deve ser um número inteiro',
    );
  });

  it('só aceita custo em entradas', () => {
    expect(() => applyMovement(state(5), MovementType.OUT, 1, d(2))).toThrow(
      'Custo unitário só pode ser informado em entradas',
    );
  });
});

describe('reversalOf', () => {
  it('desfaz uma saída com uma entrada e vice-versa', () => {
    expect(reversalOf(-2)).toEqual({ type: MovementType.IN, quantity: 2 });
    expect(reversalOf(3)).toEqual({ type: MovementType.OUT, quantity: 3 });
  });
});
