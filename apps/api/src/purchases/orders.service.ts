import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { paging } from '../common/query';
import {
  MovementType,
  OperationType,
  Prisma,
  PurchaseOrderStatus,
} from '../generated/prisma/client';
import { OperationsService } from '../movements/operations.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangeStatusDto,
  CreatePurchaseOrderDto,
  FromSuggestionsDto,
  PurchaseItemDto,
  QueryPurchaseOrderDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase.dto';
import {
  EDITABLE_STATUSES,
  RECEIVABLE_STATUSES,
  STATUS_LABELS,
  syncReceiptStatus,
  TRANSITIONS,
} from './order-status';
import { nextPurchaseNumber } from './purchase-number';

const orderDetail = {
  supplier: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
  items: {
    orderBy: [
      { variant: { product: { name: 'asc' } } },
      { variant: { color: 'asc' } },
      { variant: { size: 'asc' } },
    ],
    include: {
      variant: {
        select: {
          id: true,
          sku: true,
          size: true,
          color: true,
          quantity: true,
          product: { select: { id: true, reference: true, name: true } },
        },
      },
    },
  },
  // Recebimentos (entradas de estoque) ligados ao pedido.
  receipts: {
    orderBy: { occurredAt: 'desc' },
    select: {
      id: true,
      number: true,
      occurredAt: true,
      user: { select: { id: true, name: true } },
      reversal: { select: { id: true, number: true } },
      _count: { select: { movements: true } },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsService,
  ) {}

  async findAll(user: AuthUser, query: QueryPurchaseOrderDto) {
    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId: user.organizationId,
      supplierId: query.supplierId,
    };
    if (query.status) where.status = query.status;
    else if (query.open) where.status = { in: RECEIVABLE_STATUSES };
    if (query.search) {
      const number = Number(query.search.replace(/^#/, ''));
      where.OR = [
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        ...(Number.isInteger(number) && number > 0 && number < 2 ** 31
          ? [{ number }]
          : []),
      ];
    }
    const [orders, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        ...paging(query),
        include: {
          supplier: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          items: { select: { quantityOrdered: true, quantityReceived: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    const items = orders.map(({ items: lines, ...order }) => ({
      ...order,
      itemCount: lines.length,
      piecesOrdered: lines.reduce((s, i) => s + i.quantityOrdered, 0),
      piecesReceived: lines.reduce((s, i) => s + i.quantityReceived, 0),
    }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: user.organizationId },
      include: orderDetail,
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  async create(user: AuthUser, dto: CreatePurchaseOrderDto) {
    const previous = await this.findByKey(user, dto.idempotencyKey);
    if (previous) return previous;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const order = await this.createOrder(tx, user, {
            supplierId: dto.supplierId ?? null,
            notes: dto.notes ?? null,
            expectedAt: dto.expectedAt ?? null,
            status: dto.status ?? PurchaseOrderStatus.DRAFT,
            idempotencyKey: dto.idempotencyKey ?? null,
            items: dto.items,
          });
          return tx.purchaseOrder.findUniqueOrThrow({
            where: { id: order.id },
            include: orderDetail,
          });
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (
        dto.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.findByKey(user, dto.idempotencyKey);
        if (replay) return replay;
      }
      throw error;
    }
  }

  // Um rascunho por fornecedor, a partir de itens escolhidos nas sugestões. O
  // fornecedor vem do cadastro do produto; sem fornecedor, vão num rascunho
  // à parte. Nada disto mexe no estoque.
  async createFromSuggestions(user: AuthUser, dto: FromSuggestionsDto) {
    const ids = dto.items.map((i) => i.variantId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'A mesma variação aparece mais de uma vez: some as quantidades',
      );
    }
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: ids }, organizationId: user.organizationId },
      select: { id: true, product: { select: { supplierId: true } } },
    });
    if (variants.length !== ids.length) {
      throw new NotFoundException('Variação não encontrada');
    }
    const supplierOf = new Map(
      variants.map((v) => [v.id, v.product.supplierId ?? null]),
    );
    const groups = new Map<string | null, PurchaseItemDto[]>();
    for (const item of dto.items) {
      const supplierId = supplierOf.get(item.variantId) ?? null;
      groups.set(supplierId, [...(groups.get(supplierId) ?? []), item]);
    }

    const created: Awaited<ReturnType<typeof this.create>>[] = [];
    for (const [supplierId, items] of groups) {
      created.push(
        await this.create(user, {
          supplierId: supplierId ?? undefined,
          items,
          status: 'DRAFT',
          notes: 'Criado a partir das sugestões de compra',
          // Reenviar a mesma seleção devolve os mesmos rascunhos (uma chave
          // por fornecedor derivada da chave do envio).
          idempotencyKey: dto.idempotencyKey
            ? `${dto.idempotencyKey}#${supplierId ?? 'sem-fornecedor'}`
            : undefined,
        }),
      );
    }
    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdatePurchaseOrderDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await this.lock(tx, user, id);
        if (!EDITABLE_STATUSES.includes(order.status)) {
          throw new ConflictException(
            `Pedido ${STATUS_LABELS[order.status].toLowerCase()} não pode ser editado`,
          );
        }
        if (dto.supplierId) await this.assertSupplier(tx, user, dto.supplierId);
        if (dto.items) await this.assertVariants(tx, user, dto.items);

        await tx.purchaseOrder.update({
          where: { id },
          data: {
            ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
            ...(dto.notes !== undefined && {
              notes: dto.notes?.trim() || null,
            }),
            ...(dto.expectedAt !== undefined && {
              expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
            }),
          },
        });
        if (dto.items) {
          this.assertNoDuplicates(dto.items);
          await tx.purchaseOrderItem.deleteMany({ where: { orderId: id } });
          await tx.purchaseOrderItem.createMany({
            data: dto.items.map((item) => ({
              orderId: id,
              variantId: item.variantId,
              quantityOrdered: item.quantity,
              unitCost:
                item.unitCost === undefined
                  ? null
                  : new Prisma.Decimal(item.unitCost),
            })),
          });
        }
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id },
          include: orderDetail,
        });
      },
      { timeout: 20_000 },
    );
  }

  async changeStatus(user: AuthUser, id: string, dto: ChangeStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lock(tx, user, id);
      const allowed = TRANSITIONS[order.status] ?? [];
      const target = dto.status as PurchaseOrderStatus;
      if (!allowed.includes(target)) {
        throw new ConflictException(
          order.status === PurchaseOrderStatus.PARTIALLY_RECEIVED &&
            target === PurchaseOrderStatus.CANCELLED
            ? 'Pedido com mercadoria já recebida não pode ser cancelado'
            : `Não é possível passar de "${STATUS_LABELS[order.status]}" para "${STATUS_LABELS[target]}"`,
        );
      }
      if (target !== PurchaseOrderStatus.CANCELLED) {
        if (!order.supplierId) {
          throw new BadRequestException(
            'Escolha o fornecedor antes de enviar o pedido',
          );
        }
      }
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: target,
          ...(target === PurchaseOrderStatus.SENT && { sentAt: new Date() }),
          ...(target === PurchaseOrderStatus.CANCELLED && {
            cancelledAt: new Date(),
          }),
        },
      });
      return tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: orderDetail,
      });
    });
  }

  // Recebe peças do pedido: grava uma ENTRADA no estoque (pela mesma rotina
  // das entradas manuais) ligada ao pedido, e só então o saldo sobe. O pedido
  // fica travado durante o recebimento: dois envios simultâneos ou repetidos
  // não recebem duas vezes (a chave de operação devolve o mesmo resultado).
  async receive(user: AuthUser, id: string, dto: ReceivePurchaseOrderDto) {
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException('A data do recebimento está no futuro');
    }
    return this.prisma.$transaction(
      async (tx) => {
        const order = await this.lock(tx, user, id);

        const replay = await tx.stockOperation.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: user.organizationId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          select: { id: true, purchaseOrderId: true },
        });
        if (replay) {
          if (replay.purchaseOrderId !== id) {
            throw new ConflictException(
              'Esta chave de operação já foi usada em outro registro',
            );
          }
          return tx.purchaseOrder.findUniqueOrThrow({
            where: { id },
            include: orderDetail,
          });
        }

        if (!RECEIVABLE_STATUSES.includes(order.status)) {
          throw new ConflictException(
            order.status === PurchaseOrderStatus.DRAFT
              ? 'Confirme o pedido (Pendente) antes de receber mercadoria'
              : `Pedido ${STATUS_LABELS[order.status].toLowerCase()} não recebe mercadoria`,
          );
        }

        const lines = await tx.purchaseOrderItem.findMany({
          where: { orderId: id },
        });
        const byId = new Map(lines.map((line) => [line.id, line]));
        const seen = new Set<string>();
        const planned = dto.items.map((received, index) => {
          const line = byId.get(received.itemId);
          if (!line) {
            throw new BadRequestException(
              `Item ${index + 1}: não pertence a este pedido`,
            );
          }
          if (seen.has(line.id)) {
            throw new BadRequestException(
              `Item ${index + 1}: aparece mais de uma vez`,
            );
          }
          seen.add(line.id);
          const remaining = line.quantityOrdered - line.quantityReceived;
          if (received.quantity > remaining) {
            throw new BadRequestException(
              `Item ${index + 1}: faltam receber ${remaining} peça(s) deste item e foram informadas ${received.quantity}`,
            );
          }
          const cost = received.unitCost ?? line.unitCost?.toNumber();
          return {
            line,
            quantity: received.quantity,
            unitCost: cost === undefined ? undefined : new Prisma.Decimal(cost),
          };
        });

        const supplier = order.supplierId
          ? await tx.supplier.findUnique({
              where: { id: order.supplierId },
              select: { name: true },
            })
          : null;
        await this.operations.record(tx, user, {
          operation: {
            type: OperationType.ENTRY,
            occurredAt,
            origin:
              `Pedido de compra #${order.number}${supplier ? ` · ${supplier.name}` : ''}`.slice(
                0,
                150,
              ),
            notes: dto.notes,
            purchaseOrderId: id,
            idempotencyKey: dto.idempotencyKey,
          },
          items: planned.map((p) => ({
            variantId: p.line.variantId,
            type: MovementType.IN,
            quantity: p.quantity,
            unitCost: p.unitCost,
          })),
          allowInactive: true,
        });
        for (const p of planned) {
          await tx.purchaseOrderItem.update({
            where: { id: p.line.id },
            data: { quantityReceived: { increment: p.quantity } },
          });
        }
        await syncReceiptStatus(tx, id);
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id },
          include: orderDetail,
        });
      },
      { timeout: 30_000 },
    );
  }

  private async createOrder(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    input: {
      supplierId: string | null;
      notes: string | null;
      expectedAt: string | null;
      status: PurchaseOrderStatus;
      idempotencyKey: string | null;
      items: PurchaseItemDto[];
    },
  ) {
    if (input.supplierId) await this.assertSupplier(tx, user, input.supplierId);
    if (input.status !== PurchaseOrderStatus.DRAFT && !input.supplierId) {
      throw new BadRequestException(
        'Escolha o fornecedor para deixar o pedido pendente',
      );
    }
    this.assertNoDuplicates(input.items);
    await this.assertVariants(tx, user, input.items);
    const order = await tx.purchaseOrder.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        number: await nextPurchaseNumber(tx, user.organizationId),
        supplierId: input.supplierId,
        notes: input.notes?.trim() || null,
        expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
        status: input.status,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await tx.purchaseOrderItem.createMany({
      data: input.items.map((item) => ({
        orderId: order.id,
        variantId: item.variantId,
        quantityOrdered: item.quantity,
        unitCost:
          item.unitCost === undefined
            ? null
            : new Prisma.Decimal(item.unitCost),
      })),
    });
    return order;
  }

  // Trava a linha do pedido (da loja do usuário) até o fim da transação.
  private async lock(tx: Prisma.TransactionClient, user: AuthUser, id: string) {
    const [row] = await tx.$queryRaw<
      {
        id: string;
        number: number;
        status: PurchaseOrderStatus;
        supplier_id: string | null;
      }[]
    >`
      SELECT id, number, status, supplier_id FROM purchase_orders
      WHERE id = ${id} AND organization_id = ${user.organizationId}
      FOR UPDATE`;
    if (!row) throw new NotFoundException('Pedido não encontrado');
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      supplierId: row.supplier_id,
    };
  }

  private async assertSupplier(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    supplierId: string,
  ) {
    const supplier = await tx.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId },
      select: { active: true },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    if (!supplier.active) {
      throw new BadRequestException('Fornecedor inativo');
    }
  }

  private assertNoDuplicates(items: PurchaseItemDto[]) {
    const ids = items.map((i) => i.variantId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'A mesma variação aparece mais de uma vez: some as quantidades em um item só',
      );
    }
  }

  private async assertVariants(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    items: PurchaseItemDto[],
  ) {
    const ids = items.map((i) => i.variantId);
    const found = await tx.productVariant.findMany({
      where: { id: { in: ids }, organizationId: user.organizationId },
      select: {
        id: true,
        sku: true,
        active: true,
        product: { select: { active: true } },
      },
    });
    const map = new Map(found.map((v) => [v.id, v]));
    for (const [index, id] of ids.entries()) {
      const variant = map.get(id);
      if (!variant) {
        throw new NotFoundException(
          `Item ${index + 1}: variação não encontrada`,
        );
      }
      if (!variant.active || !variant.product.active) {
        throw new BadRequestException(
          `Item ${index + 1} (SKU ${variant.sku}): produto ou variação inativa não pode ser comprada`,
        );
      }
    }
  }

  private findByKey(user: AuthUser, key: string | undefined) {
    if (!key) return Promise.resolve(null);
    return this.prisma.purchaseOrder.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: user.organizationId,
          idempotencyKey: key,
        },
      },
      include: orderDetail,
    });
  }
}
