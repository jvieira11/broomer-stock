import { BadRequestException } from '@nestjs/common';
import { fmt, MAX_BALANCE } from '../common/limits';
import {
  MovementType,
  OperationType,
  Prisma,
} from '../generated/prisma/client';

type Decimal = Prisma.Decimal;

export interface StockState {
  quantity: number;
  averageCost: Decimal;
}

export interface StockChange {
  // Variação com sinal gravada na movimentação.
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  // Custo unitário registrado na movimentação.
  unitCost: Decimal;
  // Novo custo médio da variação.
  averageCost: Decimal;
}

// Efeito de cada tipo de operação no saldo. O estorno não está aqui: ele
// inverte cada item da operação original (ver reversalOf).
export const OPERATION_EFFECT: Record<
  Exclude<OperationType, 'REVERSAL'>,
  MovementType
> = {
  ENTRY: MovementType.IN,
  CUSTOMER_RETURN: MovementType.IN,
  INITIAL_LOAD: MovementType.IN,
  SALE: MovementType.OUT,
  SUPPLIER_RETURN: MovementType.OUT,
  LOSS: MovementType.OUT,
  INVENTORY: MovementType.ADJUSTMENT,
};

export const OPERATION_LABELS: Record<OperationType, string> = {
  ENTRY: 'Entrada',
  SALE: 'Venda',
  CUSTOMER_RETURN: 'Devolução de cliente',
  SUPPLIER_RETURN: 'Devolução ao fornecedor',
  LOSS: 'Perda/avaria',
  INVENTORY: 'Ajuste de inventário',
  REVERSAL: 'Estorno',
  INITIAL_LOAD: 'Carga inicial',
};

// Entrada soma, saída subtrai e ajuste define o saldo pela contagem informada.
// Quantidades são peças inteiras. Só a entrada altera o custo médio (média
// ponderada pelo saldo anterior); saídas e ajustes são registrados pelo custo
// médio do momento. Custos usam Decimal para não acumular erros.
export function applyMovement(
  current: StockState,
  type: MovementType,
  quantity: number,
  unitCost?: Decimal,
): StockChange {
  if (!Number.isInteger(quantity)) {
    throw new BadRequestException('A quantidade deve ser um número inteiro');
  }
  if (type !== MovementType.ADJUSTMENT && quantity <= 0) {
    throw new BadRequestException('A quantidade deve ser maior que zero');
  }
  if (type === MovementType.ADJUSTMENT && quantity < 0) {
    throw new BadRequestException('A contagem não pode ser negativa');
  }
  if (unitCost && type !== MovementType.IN) {
    throw new BadRequestException(
      'Custo unitário só pode ser informado em entradas',
    );
  }

  const balanceBefore = current.quantity;
  const unchangedCost = {
    unitCost: current.averageCost,
    averageCost: current.averageCost,
  };

  switch (type) {
    case MovementType.IN: {
      const cost = unitCost ?? current.averageCost;
      const balanceAfter = balanceBefore + quantity;
      if (balanceAfter > MAX_BALANCE) {
        throw new BadRequestException(
          `O saldo não pode passar de ${fmt(MAX_BALANCE)} peças (ficaria ${fmt(balanceAfter)})`,
        );
      }
      // Com saldo zerado, o custo médio passa a ser o da entrada.
      const averageCost =
        balanceBefore <= 0
          ? cost
          : current.averageCost
              .times(balanceBefore)
              .plus(cost.times(quantity))
              .dividedBy(balanceAfter)
              .toDecimalPlaces(4);
      return {
        delta: quantity,
        balanceBefore,
        balanceAfter,
        unitCost: cost,
        averageCost,
      };
    }

    case MovementType.OUT:
      if (quantity > balanceBefore) {
        throw new BadRequestException(
          `Estoque insuficiente: disponível ${balanceBefore}, solicitado ${quantity}`,
        );
      }
      return {
        delta: -quantity,
        balanceBefore,
        balanceAfter: balanceBefore - quantity,
        ...unchangedCost,
      };

    case MovementType.ADJUSTMENT:
      if (quantity === balanceBefore) {
        throw new BadRequestException(
          'A contagem informada é igual ao saldo atual',
        );
      }
      return {
        delta: quantity - balanceBefore,
        balanceBefore,
        balanceAfter: quantity,
        ...unchangedCost,
      };
  }
}

// Como desfazer um item já gravado: uma saída volta como entrada pelo mesmo
// custo; uma entrada (ou ajuste para mais) sai pelo custo médio atual.
export function reversalOf(delta: number): {
  type: MovementType;
  quantity: number;
} {
  return delta > 0
    ? { type: MovementType.OUT, quantity: delta }
    : { type: MovementType.IN, quantity: -delta };
}
