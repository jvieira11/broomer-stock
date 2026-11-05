import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SIZE_ORDER } from '../products/size-order';
import { QuerySuggestionDto, SettingsDto } from './dto/purchase.dto';
import { RECEIVABLE_STATUSES } from './order-status';
import {
  CLASSIFICATION_LABELS,
  CLASSIFICATION_ORDER,
  DEFAULT_PARAMS,
  suggest,
  type Classification,
  type PurchaseParams,
  type Suggestion,
} from './suggestion-rules';

const DAY_MS = 86_400_000;
// Teto de variações analisadas de uma vez (uma loja de moda tem poucos
// milhares). Acima disso a lista é cortada e a resposta avisa (truncated).
const MAX_ROWS = 10_000;

interface DemandRow {
  id: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  min_quantity: number;
  average_cost: string;
  product_id: string;
  reference: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  sold: number;
  sale_ops: number;
  last_sale_at: Date | null;
  history_start: Date;
  on_order: number;
}

export interface SuggestionRow extends Suggestion {
  variantId: string;
  sku: string;
  size: string;
  color: string;
  product: { id: string; reference: string; name: string };
  category: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  quantity: number;
  minQuantity: number;
  sold: number;
  onOrder: number;
  averageCost: string;
  lastSaleAt: Date | null;
}

@Injectable()
export class SuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(user: AuthUser): Promise<PurchaseParams> {
    const row = await this.prisma.purchaseSetting.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!row) return { ...DEFAULT_PARAMS };
    return {
      analysisDays: row.analysisDays,
      leadTimeDays: row.leadTimeDays,
      coverDays: row.coverDays,
      minSales: row.minSales,
      minHistoryDays: row.minHistoryDays,
      excessDays: row.excessDays,
    };
  }

  async saveSettings(user: AuthUser, dto: SettingsDto) {
    const data = { ...dto };
    await this.prisma.purchaseSetting.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId, ...data },
      update: data,
    });
    return this.getSettings(user);
  }

  // Calcula a sugestão de todas as variações ativas (com os filtros) e a
  // devolve ordenada por urgência. Tudo sai do estoque e das vendas reais:
  // vendas estornadas não contam, e pedidos abertos entram como "a caminho".
  async computeAll(
    user: AuthUser,
    filters: Pick<
      QuerySuggestionDto,
      'categoryId' | 'supplierId' | 'productId' | 'search' | 'days'
    > = {},
  ) {
    const params = await this.getSettings(user);
    if (filters.days) params.analysisDays = filters.days;
    const org = user.organizationId;
    const now = new Date();
    const since = new Date(now.getTime() - params.analysisDays * DAY_MS);

    const conditions = [
      Prisma.sql`v.organization_id = ${org}`,
      Prisma.sql`v.active`,
      Prisma.sql`p.active`,
    ];
    if (filters.categoryId) {
      conditions.push(Prisma.sql`p.category_id = ${filters.categoryId}`);
    }
    if (filters.supplierId) {
      conditions.push(Prisma.sql`p.supplier_id = ${filters.supplierId}`);
    }
    if (filters.productId) {
      conditions.push(Prisma.sql`p.id = ${filters.productId}`);
    }
    if (filters.search) {
      const like = `%${filters.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(
        Prisma.sql`(p.name ILIKE ${like} OR p.reference ILIKE ${like} OR v.sku ILIKE ${like} OR v.color ILIKE ${like})`,
      );
    }

    const rows = await this.prisma.$queryRaw<DemandRow[]>`
      SELECT v.id, v.sku, v.size, v.color, v.quantity,
             COALESCE(v.min_quantity, p.min_quantity) AS min_quantity,
             v.average_cost::text AS average_cost,
             p.id AS product_id, p.reference, p.name,
             c.id AS category_id, c.name AS category_name,
             s.id AS supplier_id, s.name AS supplier_name,
             COALESCE(sales.sold, 0)::int AS sold,
             COALESCE(sales.ops, 0)::int AS sale_ops,
             sales.last_sale_at,
             COALESCE(first.first_at, v.created_at) AS history_start,
             COALESCE(inbound.pending, 0)::int AS on_order
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN LATERAL (
        SELECT -SUM(m.quantity) AS sold,
               COUNT(DISTINCT o.id) AS ops,
               MAX(o.occurred_at) AS last_sale_at
        FROM stock_movements m
        JOIN stock_operations o ON o.id = m.operation_id
        WHERE m.variant_id = v.id AND o.type = 'SALE'
          AND o.occurred_at >= ${since} AND o.occurred_at <= ${now}
          AND NOT EXISTS (
            SELECT 1 FROM stock_operations r WHERE r.reversed_operation_id = o.id
          )
      ) sales ON true
      LEFT JOIN LATERAL (
        SELECT MIN(o.occurred_at) AS first_at
        FROM stock_movements m
        JOIN stock_operations o ON o.id = m.operation_id
        WHERE m.variant_id = v.id
      ) first ON true
      LEFT JOIN LATERAL (
        SELECT SUM(i.quantity_ordered - i.quantity_received) AS pending
        FROM purchase_order_items i
        JOIN purchase_orders po ON po.id = i.order_id
        WHERE i.variant_id = v.id
          AND po.status = ANY(${RECEIVABLE_STATUSES}::"PurchaseOrderStatus"[])
      ) inbound ON true
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY p.name, p.reference, v.color, ${SIZE_ORDER}
      LIMIT ${MAX_ROWS + 1}`;

    const truncated = rows.length > MAX_ROWS;
    const items: SuggestionRow[] = rows.slice(0, MAX_ROWS).map((row) => {
      const result = suggest(
        {
          quantity: row.quantity,
          minQuantity: row.min_quantity,
          sold: row.sold,
          saleOperations: row.sale_ops,
          historyDays: (now.getTime() - row.history_start.getTime()) / DAY_MS,
          onOrder: row.on_order,
        },
        params,
      );
      return {
        ...result,
        variantId: row.id,
        sku: row.sku,
        size: row.size,
        color: row.color,
        product: {
          id: row.product_id,
          reference: row.reference,
          name: row.name,
        },
        category: row.category_id
          ? { id: row.category_id, name: row.category_name ?? '' }
          : null,
        supplier: row.supplier_id
          ? { id: row.supplier_id, name: row.supplier_name ?? '' }
          : null,
        quantity: row.quantity,
        minQuantity: row.min_quantity,
        sold: row.sold,
        onOrder: row.on_order,
        averageCost: row.average_cost,
        lastSaleAt: row.last_sale_at,
      };
    });

    items.sort(
      (a, b) =>
        CLASSIFICATION_ORDER.indexOf(a.classification) -
          CLASSIFICATION_ORDER.indexOf(b.classification) ||
        (b.suggested ?? b.minShortfall ?? 0) -
          (a.suggested ?? a.minShortfall ?? 0),
    );
    return { params, items, truncated };
  }

  async suggestions(user: AuthUser, query: QuerySuggestionDto) {
    const { params, items, truncated } = await this.computeAll(user, query);

    const counts = Object.fromEntries(
      CLASSIFICATION_ORDER.map((c) => [c, 0]),
    ) as Record<Classification, number>;
    let totalSuggested = 0;
    for (const item of items) {
      counts[item.classification] += 1;
      totalSuggested += item.suggested ?? 0;
    }

    let filtered = items;
    if (query.classification) {
      filtered = filtered.filter(
        (i) => i.classification === query.classification,
      );
    }
    if (query.onlyActionable) {
      filtered = filtered.filter((i) => (i.suggested ?? 0) > 0);
    }
    const start = (query.page - 1) * query.pageSize;
    return {
      params,
      counts,
      labels: CLASSIFICATION_LABELS,
      totalSuggested,
      truncated,
      items: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // Números do dashboard de compras.
  async summary(user: AuthUser) {
    const org = user.organizationId;
    const { params, items, truncated } = await this.computeAll(user);

    const counts = Object.fromEntries(
      CLASSIFICATION_ORDER.map((c) => [c, 0]),
    ) as Record<Classification, number>;
    let totalSuggested = 0;
    let estimatedCost = 0;
    let withoutCost = 0;
    const byProduct = new Map<
      string,
      {
        id: string;
        name: string;
        suggested: number;
        variants: number;
        sold: number;
        stock: number;
      }
    >();
    for (const item of items) {
      counts[item.classification] += 1;
      const suggested = item.suggested ?? 0;
      totalSuggested += suggested;
      if (suggested > 0) {
        const cost = Number(item.averageCost);
        if (cost > 0) estimatedCost += cost * suggested;
        else withoutCost += 1;
      }
      const entry = byProduct.get(item.product.id) ?? {
        id: item.product.id,
        name: item.product.name,
        suggested: 0,
        variants: 0,
        sold: 0,
        stock: 0,
      };
      entry.suggested += suggested;
      entry.variants += suggested > 0 ? 1 : 0;
      entry.sold += item.sold;
      entry.stock += item.quantity;
      byProduct.set(item.product.id, entry);
    }
    const products = [...byProduct.values()];
    const stale = items
      .filter((i) => i.classification === 'STALE')
      .reduce((acc, i) => {
        const e = acc.get(i.product.id) ?? {
          id: i.product.id,
          name: i.product.name,
          pieces: 0,
        };
        e.pieces += i.quantity;
        acc.set(i.product.id, e);
        return acc;
      }, new Map<string, { id: string; name: string; pieces: number }>());

    const [byStatus, openOrders, openItems, recentEntries] = await Promise.all([
      this.prisma.purchaseOrder.groupBy({
        by: ['status'],
        where: { organizationId: org },
        _count: { _all: true },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { organizationId: org, status: { in: RECEIVABLE_STATUSES } },
        orderBy: [
          { expectedAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
        take: 8,
        include: {
          supplier: { select: { id: true, name: true } },
          items: { select: { quantityOrdered: true, quantityReceived: true } },
        },
      }),
      this.prisma.purchaseOrderItem.aggregate({
        where: {
          order: { organizationId: org, status: { in: RECEIVABLE_STATUSES } },
        },
        _sum: { quantityOrdered: true, quantityReceived: true },
      }),
      this.prisma.stockOperation.findMany({
        where: { organizationId: org, type: 'ENTRY' },
        orderBy: [{ occurredAt: 'desc' }, { number: 'desc' }],
        take: 10,
        include: {
          user: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, number: true } },
          reversal: { select: { id: true, number: true } },
          movements: { select: { quantity: true } },
        },
      }),
    ]);

    return {
      params,
      truncated,
      counts,
      totalSuggested,
      estimatedCost: estimatedCost.toFixed(2),
      suggestedWithoutCost: withoutCost,
      needReplenish: counts.CRITICAL + counts.REPLENISH,
      topNeed: products
        .filter((p) => p.suggested > 0)
        .sort((a, b) => b.suggested - a.suggested)
        .slice(0, 8),
      topSold: products
        .filter((p) => p.sold > 0)
        .sort((a, b) => b.sold - a.sold)
        .slice(0, 8)
        .map(({ id, name, sold, stock }) => ({ id, name, sold, stock })),
      topStale: [...stale.values()]
        .sort((a, b) => b.pieces - a.pieces)
        .slice(0, 8),
      ordersByStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count._all]),
      ),
      awaitingPieces:
        (openItems._sum.quantityOrdered ?? 0) -
        (openItems._sum.quantityReceived ?? 0),
      openOrders: openOrders.map(({ items: lines, ...order }) => ({
        ...order,
        piecesPending: lines.reduce(
          (s, i) => s + i.quantityOrdered - i.quantityReceived,
          0,
        ),
      })),
      recentEntries: recentEntries.map(({ movements, ...op }) => ({
        ...op,
        pieces: movements.reduce((s, m) => s + m.quantity, 0),
      })),
    };
  }
}
