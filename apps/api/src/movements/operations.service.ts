import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CAN_ADJUST_STOCK } from '../auth/decorators';
import { paging, periodFilter } from '../common/query';
import {
  MovementType,
  OperationType,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOperationDto,
  QueryMovementDto,
  QueryOperationDto,
  ReverseOperationDto,
} from './dto/operation.dto';
import { syncReceiptStatus } from '../purchases/order-status';
import { nextOperationNumber } from './operation-number';
import {
  applyMovement,
  OPERATION_EFFECT,
  OPERATION_LABELS,
  reversalOf,
} from './stock-rules';

// Operadores registram entradas e vendas; o resto (perdas, devoluções,
// inventário e estornos) altera o saldo por decisão e fica com gerente e
// administrador.
const OPERATOR_TYPES: OperationType[] = [
  OperationType.ENTRY,
  OperationType.SALE,
];

// Tipos em que o motivo é obrigatório.
const REASON_REQUIRED: OperationType[] = [
  OperationType.CUSTOMER_RETURN,
  OperationType.SUPPLIER_RETURN,
  OperationType.LOSS,
  OperationType.INVENTORY,
];

// Tolerância para relógios levemente adiantados no registro de "agora".
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const variantSummary = {
  select: {
    id: true,
    sku: true,
    size: true,
    color: true,
    product: { select: { id: true, reference: true, name: true } },
  },
} as const;

const userSummary = { select: { id: true, name: true } } as const;

export const operationDetail = {
  user: userSummary,
  movements: {
    orderBy: { createdAt: 'asc' },
    include: { variant: variantSummary },
  },
  reversal: { select: { id: true, number: true, createdAt: true } },
  reversedOperation: { select: { id: true, number: true, type: true } },
  purchaseOrder: { select: { id: true, number: true } },
} satisfies Prisma.StockOperationInclude;

interface LockedVariant {
  id: string;
  sku: string;
  quantity: number;
  average_cost: string;
  active: boolean;
  product_active: boolean;
}

interface PlannedItem {
  variantId: string;
  type: MovementType;
  quantity: number;
  unitCost?: Prisma.Decimal;
}

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateOperationDto) {
    if (
      !CAN_ADJUST_STOCK.includes(user.role) &&
      !OPERATOR_TYPES.includes(dto.type)
    ) {
      throw new ForbiddenException(
        `Seu perfil não pode registrar ${OPERATION_LABELS[dto.type].toLowerCase()}`,
      );
    }
    if (REASON_REQUIRED.includes(dto.type) && !dto.reason) {
      throw new BadRequestException('Informe o motivo');
    }
    const effect = OPERATION_EFFECT[dto.type];
    if (
      effect !== MovementType.IN &&
      dto.items.some((i) => i.unitCost !== undefined)
    ) {
      throw new BadRequestException(
        'Custo unitário só pode ser informado em entradas',
      );
    }
    const ids = dto.items.map((item) => item.variantId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'A mesma variação aparece mais de uma vez: some as quantidades em um item só',
      );
    }
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('A data da operação está no futuro');
    }

    return this.idempotent(user, dto.idempotencyKey, () =>
      this.prisma.$transaction(
        (tx) =>
          this.record(tx, user, {
            operation: {
              type: dto.type,
              occurredAt,
              saleReference: dto.saleReference,
              origin: dto.origin,
              reason: dto.reason,
              notes: dto.notes,
              idempotencyKey: dto.idempotencyKey,
            },
            items: dto.items.map((item) => ({
              variantId: item.variantId,
              type: effect,
              quantity: item.quantity,
              unitCost:
                item.unitCost === undefined
                  ? undefined
                  : new Prisma.Decimal(item.unitCost),
            })),
            allowInactive: false,
          }),
        { timeout: 20_000 },
      ),
    );
  }

  // Desfaz todos os itens de uma operação com uma nova operação (REVERSAL)
  // que aponta para a original. A original continua no histórico.
  async reverse(user: AuthUser, id: string, dto: ReverseOperationDto) {
    return this.idempotent(user, dto.idempotencyKey, async () => {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const original = await tx.stockOperation.findFirst({
              where: { id, organizationId: user.organizationId },
              include: { movements: true, reversal: { select: { id: true } } },
            });
            if (!original) {
              throw new NotFoundException('Operação não encontrada');
            }
            if (original.type === OperationType.REVERSAL) {
              throw new BadRequestException(
                'Um estorno não pode ser estornado: registre uma nova operação',
              );
            }
            if (original.reversal) {
              throw new ConflictException('Esta operação já foi estornada');
            }
            // Recebimento de pedido de compra: trava o pedido antes do saldo
            // (mesma ordem do recebimento, sem deadlock) e, depois, devolve
            // ao pedido as peças que este estorno tira do estoque.
            if (original.purchaseOrderId) {
              await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${original.purchaseOrderId} FOR UPDATE`;
            }

            const reversal = await this.record(tx, user, {
              operation: {
                type: OperationType.REVERSAL,
                occurredAt: new Date(),
                reason: dto.reason,
                reversedOperationId: original.id,
                saleReference: original.saleReference,
                idempotencyKey: dto.idempotencyKey,
              },
              items: original.movements.map((movement) => {
                const undo = reversalOf(movement.quantity);
                return {
                  variantId: movement.variantId,
                  ...undo,
                  // Peças que voltam ao estoque voltam pelo custo com que saíram.
                  unitCost:
                    undo.type === MovementType.IN
                      ? movement.unitCost
                      : undefined,
                };
              }),
              allowInactive: true,
            });
            if (original.purchaseOrderId) {
              for (const movement of original.movements) {
                await tx.purchaseOrderItem.updateMany({
                  where: {
                    orderId: original.purchaseOrderId,
                    variantId: movement.variantId,
                  },
                  data: { quantityReceived: { decrement: movement.quantity } },
                });
              }
              await syncReceiptStatus(tx, original.purchaseOrderId);
            }
            return reversal;
          },
          { timeout: 20_000 },
        );
      } catch (error) {
        // Dois estornos simultâneos: o índice único de reversed_operation_id barra o segundo.
        // Se foi o reenvio do mesmo estorno, deixa idempotent() devolvê-lo.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          !(await this.findByKey(user, dto.idempotencyKey))
        ) {
          throw new ConflictException('Esta operação já foi estornada');
        }
        throw error;
      }
    });
  }

  async findAll(user: AuthUser, query: QueryOperationDto) {
    const where: Prisma.StockOperationWhereInput = {
      organizationId: user.organizationId,
      type: query.type,
      userId: query.userId,
      occurredAt: periodFilter(query),
    };
    if (query.search) {
      const number = Number(query.search.replace(/^#/, ''));
      where.OR = [
        { saleReference: { contains: query.search, mode: 'insensitive' } },
        { origin: { contains: query.search, mode: 'insensitive' } },
        ...(Number.isInteger(number) && number > 0 && number < 2 ** 31
          ? [{ number }]
          : []),
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.stockOperation.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { number: 'desc' }],
        ...paging(query),
        include: {
          user: userSummary,
          reversal: { select: { id: true, number: true } },
          _count: { select: { movements: true } },
        },
      }),
      this.prisma.stockOperation.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const operation = await this.prisma.stockOperation.findFirst({
      where: { id, organizationId: user.organizationId },
      include: operationDetail,
    });
    if (!operation) {
      throw new NotFoundException('Operação não encontrada');
    }
    return operation;
  }

  async findMovements(user: AuthUser, query: QueryMovementDto) {
    const variant: Prisma.ProductVariantWhereInput = {
      productId: query.productId,
      size: query.size,
      color: query.color,
      product: query.categoryId ? { categoryId: query.categoryId } : undefined,
    };
    const where: Prisma.StockMovementWhereInput = {
      organizationId: user.organizationId,
      variantId: query.variantId,
      userId: query.userId,
      variant,
      operation: {
        type: query.type,
        occurredAt: periodFilter(query),
      },
    };
    if (query.search) {
      where.OR = [
        { variant: { sku: { contains: query.search } } },
        { variant: { product: { reference: { contains: query.search } } } },
        {
          variant: {
            product: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
        {
          operation: {
            saleReference: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ operation: { occurredAt: 'desc' } }, { createdAt: 'desc' }],
        ...paging(query),
        include: {
          variant: variantSummary,
          user: userSummary,
          operation: {
            select: {
              id: true,
              number: true,
              type: true,
              occurredAt: true,
              saleReference: true,
              origin: true,
              reason: true,
              notes: true,
            },
          },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  // Grava a operação e seus itens numa transação. As variações são travadas
  // (FOR UPDATE) em ordem de id: duas operações simultâneas sobre o mesmo SKU
  // esperam uma pela outra, sem deadlock, e a segunda já vê o saldo novo.
  // Também usado pelo recebimento de pedidos de compra (purchases).
  async record(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    input: {
      operation: Omit<
        Prisma.StockOperationUncheckedCreateInput,
        'organizationId' | 'userId' | 'number'
      >;
      items: PlannedItem[];
      allowInactive: boolean;
    },
  ) {
    const ids = [...new Set(input.items.map((item) => item.variantId))].sort();
    const locked = await tx.$queryRaw<LockedVariant[]>`
      SELECT v.id, v.sku, v.quantity, v.average_cost::text, v.active,
             p.active AS product_active
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE v.organization_id = ${user.organizationId}
        AND v.id = ANY(${ids}::text[])
      ORDER BY v.id
      FOR UPDATE OF v`;
    const variants = new Map(locked.map((v) => [v.id, v]));

    const movements: Omit<
      Prisma.StockMovementCreateManyInput,
      'operationId'
    >[] = [];
    for (const [index, item] of input.items.entries()) {
      const variant = variants.get(item.variantId);
      if (!variant) {
        throw new NotFoundException(
          `Item ${index + 1}: variação não encontrada`,
        );
      }
      if (!input.allowInactive && !(variant.active && variant.product_active)) {
        throw new BadRequestException(
          `Item ${index + 1} (SKU ${variant.sku}): produto ou variação inativa não pode ser movimentada`,
        );
      }

      let change: ReturnType<typeof applyMovement>;
      try {
        change = applyMovement(
          {
            quantity: variant.quantity,
            averageCost: new Prisma.Decimal(variant.average_cost),
          },
          item.type,
          item.quantity,
          item.unitCost,
        );
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw new BadRequestException(
            `Item ${index + 1} (SKU ${variant.sku}): ${error.message}`,
          );
        }
        throw error;
      }

      // Atualiza o mapa: o saldo seguinte parte deste.
      variant.quantity = change.balanceAfter;
      variant.average_cost = change.averageCost.toString();
      await tx.productVariant.update({
        where: { id: variant.id },
        data: {
          quantity: change.balanceAfter,
          averageCost: change.averageCost,
        },
      });
      movements.push({
        organizationId: user.organizationId,
        variantId: variant.id,
        userId: user.id,
        type: item.type,
        quantity: change.delta,
        balanceBefore: change.balanceBefore,
        balanceAfter: change.balanceAfter,
        unitCost: change.unitCost,
      });
    }

    // Só agora, com todos os itens válidos, a operação ganha número.
    const operation = await tx.stockOperation.create({
      data: {
        ...input.operation,
        number: await nextOperationNumber(tx),
        organizationId: user.organizationId,
        userId: user.id,
      },
    });
    await tx.stockMovement.createMany({
      data: movements.map((m) => ({ ...m, operationId: operation.id })),
    });

    return tx.stockOperation.findUniqueOrThrow({
      where: { id: operation.id },
      include: operationDetail,
    });
  }

  // Reenvio com a mesma chave devolve a operação já gravada, inclusive quando
  // os dois envios chegam juntos (o índice único barra o segundo).
  private findByKey(user: AuthUser, key: string | undefined) {
    if (!key) return Promise.resolve(null);
    return this.prisma.stockOperation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: user.organizationId,
          idempotencyKey: key,
        },
      },
      include: operationDetail,
    });
  }

  private async idempotent<T>(
    user: AuthUser,
    key: string | undefined,
    run: () => Promise<T>,
  ) {
    const previous = await this.findByKey(user, key);
    if (previous) return previous;
    try {
      return await run();
    } catch (error) {
      if (
        key &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.findByKey(user, key);
        if (replay) return replay;
      }
      throw error;
    }
  }
}
