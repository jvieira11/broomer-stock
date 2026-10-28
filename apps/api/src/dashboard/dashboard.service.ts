import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { periodFilter } from '../common/query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STATUS_SQL } from '../products/products.service';
import { DashboardQueryDto } from './dashboard.dto';

const TIME_ZONE = 'America/Maceio';
const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

// Data (AAAA-MM-DD) no fuso da loja, deslocada em `days` dias a partir de hoje.
function localDate(days = 0) {
  const date = new Date(Date.now() + days * DAY_MS);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
}

// Dia da operação no fuso da loja (as datas são gravadas em UTC).
const LOCAL_DAY = Prisma.sql`(o.occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${TIME_ZONE})::date`;

interface StockTotals {
  variants: number;
  pieces: number;
  low: number;
  out: number;
  cost: string;
  sale: string;
}

interface Flows {
  entries: number;
  sales: number;
  sale_operations: number;
  other_out: number;
  reversals: number;
}

interface LowStockRow {
  id: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  min_quantity: number;
  status: string;
  product_id: string;
  name: string;
}

// Todos os números saem do banco, filtrados pela loja do usuário.
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthUser, query: DashboardQueryDto = {}) {
    const org = user.organizationId;
    const to = query.to ?? localDate();
    const from = query.from ?? localDate(-(DEFAULT_DAYS - 1));
    const { gte, lt } = periodFilter({ from, to }) as { gte: Date; lt: Date };
    if (lt.getTime() - gte.getTime() > MAX_DAYS * DAY_MS) {
      throw new BadRequestException(`O período máximo é de ${MAX_DAYS} dias`);
    }

    const [
      [stock],
      [flows],
      daily,
      topProducts,
      lowStock,
      recentOperations,
      products,
      categories,
    ] = await Promise.all([
      // Só variações ativas de produtos ativos contam como estoque disponível.
      this.prisma.$queryRaw<StockTotals[]>`
        SELECT COUNT(*)::int AS variants,
               COALESCE(SUM(v.quantity), 0)::int AS pieces,
               COUNT(*) FILTER (WHERE ${STATUS_SQL} = 'LOW')::int AS low,
               COUNT(*) FILTER (WHERE ${STATUS_SQL} = 'OUT')::int AS out,
               COALESCE(SUM(v.quantity * v.average_cost), 0)::numeric(14, 2)::text AS cost,
               COALESCE(SUM(v.quantity * COALESCE(v.sale_price, p.sale_price)), 0)::numeric(14, 2)::text AS sale
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        WHERE v.organization_id = ${org} AND v.active AND p.active`,
      // Entradas de mercadoria e vendas do período. Estornos são contados à
      // parte, sem descontar dos totais, para não esconder o que aconteceu.
      this.prisma.$queryRaw<Flows[]>`
        SELECT
          COALESCE(SUM(m.quantity) FILTER (WHERE o.type = 'ENTRY'), 0)::int AS entries,
          COALESCE(-SUM(m.quantity) FILTER (WHERE o.type = 'SALE'), 0)::int AS sales,
          COUNT(DISTINCT o.id) FILTER (WHERE o.type = 'SALE')::int AS sale_operations,
          COALESCE(-SUM(m.quantity) FILTER (WHERE o.type IN ('LOSS', 'SUPPLIER_RETURN')), 0)::int AS other_out,
          COUNT(DISTINCT o.id) FILTER (WHERE o.type = 'REVERSAL')::int AS reversals
        FROM stock_operations o
        JOIN stock_movements m ON m.operation_id = o.id
        WHERE o.organization_id = ${org}
          AND o.occurred_at >= ${gte} AND o.occurred_at < ${lt}`,
      // Peças que entraram e saíram por dia, de qualquer operação.
      this.prisma.$queryRaw<{ day: string; in: number; out: number }[]>`
        SELECT to_char(${LOCAL_DAY}, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(m.quantity) FILTER (WHERE m.quantity > 0), 0)::int AS in,
               COALESCE(-SUM(m.quantity) FILTER (WHERE m.quantity < 0), 0)::int AS out
        FROM stock_operations o
        JOIN stock_movements m ON m.operation_id = o.id
        WHERE o.organization_id = ${org}
          AND o.occurred_at >= ${gte} AND o.occurred_at < ${lt}
        GROUP BY 1
        ORDER BY 1`,
      // Modelos com mais peças registradas como venda no período.
      this.prisma.$queryRaw<
        { id: string; reference: string; name: string; sold: number }[]
      >`
        SELECT p.id, p.reference, p.name, (-SUM(m.quantity))::int AS sold
        FROM stock_operations o
        JOIN stock_movements m ON m.operation_id = o.id
        JOIN product_variants v ON v.id = m.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE o.organization_id = ${org} AND o.type = 'SALE'
          AND o.occurred_at >= ${gte} AND o.occurred_at < ${lt}
        GROUP BY p.id
        ORDER BY sold DESC, p.name
        LIMIT 5`,
      this.prisma.$queryRaw<LowStockRow[]>`
        SELECT v.id, v.sku, v.size, v.color, v.quantity,
               COALESCE(v.min_quantity, p.min_quantity) AS min_quantity,
               ${STATUS_SQL} AS status, p.id AS product_id, p.name
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        WHERE v.organization_id = ${org} AND v.active AND p.active
          AND ${STATUS_SQL} <> 'NORMAL'
        ORDER BY v.quantity, p.name, v.color, v.size
        LIMIT 10`,
      this.prisma.stockOperation.findMany({
        where: { organizationId: org },
        orderBy: [{ occurredAt: 'desc' }, { number: 'desc' }],
        take: 8,
        include: {
          user: { select: { id: true, name: true } },
          _count: { select: { movements: true } },
        },
      }),
      this.prisma.product.count({
        where: { organizationId: org, active: true },
      }),
      this.prisma.category.count({
        where: { organizationId: org, active: true },
      }),
    ]);

    return {
      period: { from, to },
      activeProducts: products,
      activeVariants: stock.variants,
      categories,
      totalPieces: stock.pieces,
      lowStockCount: stock.low,
      outOfStockCount: stock.out,
      stockCostValue: stock.cost,
      stockSaleValue: stock.sale,
      entries: flows.entries,
      sales: flows.sales,
      saleOperations: flows.sale_operations,
      otherOutputs: flows.other_out,
      reversals: flows.reversals,
      daily,
      topProducts,
      lowStock: lowStock.map((row) => ({
        id: row.id,
        sku: row.sku,
        size: row.size,
        color: row.color,
        quantity: row.quantity,
        minQuantity: row.min_quantity,
        status: row.status,
        product: { id: row.product_id, name: row.name },
      })),
      recentOperations,
    };
  }
}
