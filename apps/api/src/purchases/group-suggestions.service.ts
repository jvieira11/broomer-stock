import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RECEIVABLE_STATUSES } from './order-status';
import { SuggestionsService } from './suggestions.service';
import {
  CLASSIFICATION_ORDER,
  suggest,
  type Classification,
  type Suggestion,
} from './suggestion-rules';

const DAY_MS = 86_400_000;

// Categoria = primeira palavra do nome/descrição ("ZZ" é prefixo do ERP), sem
// acento e em maiúsculas: igual nas duas pontas (estoque e vendas importadas).
const fold = (expr: Prisma.Sql) =>
  Prisma.sql`translate(upper(${expr}), 'ÁÀÂÃÄÇÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜ', 'AAAAACEEEEIIIIOOOOOUUUU')`;
const firstWords = (col: string) =>
  Prisma.sql`CASE WHEN upper(split_part(${Prisma.raw(col)}, ' ', 1)) = 'ZZ'
       THEN split_part(${Prisma.raw(col)}, ' ', 2)
       ELSE split_part(${Prisma.raw(col)}, ' ', 1) END`;
const CATEGORY_STOCK = fold(firstWords('p.name'));
const CATEGORY_SALES = fold(firstWords('description'));
// Tamanho no padrão do estoque: DV e "-" = sem tamanho; "58M" = "58 M".
const SIZE_SALES = Prisma.sql`CASE WHEN upper(trim(size)) IN ('DV', '-') THEN ''
  ELSE regexp_replace(upper(trim(size)), '^(\\d+)\\s*([A-Z]+)$', '\\1 \\2') END`;

interface GroupRow {
  category: string;
  size: string;
  stock: number;
  min_quantity: number;
  on_order: number;
  sold: number;
  sale_lines: number;
}

export interface GroupSuggestion extends Suggestion {
  category: string;
  size: string;
  quantity: number;
  minQuantity: number;
  sold: number;
  onOrder: number;
}

// Sugestão de reposição por CATEGORIA + TAMANHO, a partir do histórico de
// vendas importado. O relatório de vendas do ERP não traz código nem cor e a
// descrição vem cortada, então a venda não pode ser ligada a um SKU; categoria
// e tamanho existem nas duas pontas. Usa a mesma regra do cálculo por variação
// (suggestion-rules.ts); não diz qual modelo ou cor comprar, só quantas peças
// de cada tamanho, por categoria.
@Injectable()
export class GroupSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SuggestionsService,
  ) {}

  async bySize(user: AuthUser, query: { category?: string; days?: number }) {
    const org = user.organizationId;
    const params = await this.settings.getSettings(user);
    if (query.days) params.analysisDays = query.days;

    const [range] = await this.prisma.$queryRaw<
      { first: Date | null; last: Date | null }[]
    >`SELECT MIN(sold_on) AS first, MAX(sold_on) AS last
      FROM sale_lines WHERE organization_id = ${org}`;
    if (!range?.first || !range.last) {
      return { hasSales: false, params, referenceDate: null, items: [] };
    }
    // O histórico termina na última venda importada (não em "hoje").
    const end = range.last;
    const since = new Date(end.getTime() - (params.analysisDays - 1) * DAY_MS);
    const historyDays = (end.getTime() - range.first.getTime()) / DAY_MS + 1;
    // Categoria sem acento, como nas duas pontas.
    const categoryCondition = query.category
      ? Prisma.sql`AND COALESCE(s.cat, h.cat) = ${query.category
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toUpperCase()}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<GroupRow[]>`
      WITH stock AS (
        SELECT ${CATEGORY_STOCK} AS cat, v.size AS size,
               SUM(v.quantity)::int AS stock,
               SUM(COALESCE(v.min_quantity, p.min_quantity))::int AS min_quantity,
               COALESCE(SUM(inb.pending), 0)::int AS on_order
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        LEFT JOIN LATERAL (
          SELECT SUM(i.quantity_ordered - i.quantity_received) AS pending
          FROM purchase_order_items i
          JOIN purchase_orders po ON po.id = i.order_id
          WHERE i.variant_id = v.id
            AND po.status = ANY(${RECEIVABLE_STATUSES}::"PurchaseOrderStatus"[])
        ) inb ON true
        WHERE v.organization_id = ${org} AND v.active AND p.active
        GROUP BY 1, 2
      ), sales AS (
        SELECT ${CATEGORY_SALES} AS cat, ${SIZE_SALES} AS size,
               SUM(quantity)::int AS sold,
               COUNT(*) FILTER (WHERE quantity > 0)::int AS sale_lines
        FROM sale_lines
        WHERE organization_id = ${org}
          AND sold_on >= ${since}::date AND sold_on <= ${end}::date
        GROUP BY 1, 2
      )
      SELECT COALESCE(s.cat, h.cat) AS category, COALESCE(s.size, h.size) AS size,
             COALESCE(s.stock, 0) AS stock, COALESCE(s.min_quantity, 0) AS min_quantity,
             COALESCE(s.on_order, 0) AS on_order,
             COALESCE(h.sold, 0) AS sold, COALESCE(h.sale_lines, 0) AS sale_lines
      FROM stock s
      FULL OUTER JOIN sales h ON h.cat = s.cat AND h.size = s.size
      WHERE COALESCE(s.cat, h.cat) <> '' ${categoryCondition}
        AND (COALESCE(s.stock, 0) > 0 OR COALESCE(h.sold, 0) > 0)`;

    const items: GroupSuggestion[] = rows.map((row) => {
      const result = suggest(
        {
          quantity: row.stock,
          minQuantity: row.min_quantity,
          // Só o que foi vendido (devolução já está no líquido).
          sold: Math.max(row.sold, 0),
          // Linhas de venda (o relatório não tem número de cupom).
          saleOperations: row.sale_lines,
          historyDays,
          onOrder: row.on_order,
        },
        params,
      );
      return {
        ...result,
        category: row.category,
        size: row.size,
        quantity: row.stock,
        minQuantity: row.min_quantity,
        sold: Math.max(row.sold, 0),
        onOrder: row.on_order,
      };
    });
    items.sort(
      (a, b) =>
        CLASSIFICATION_ORDER.indexOf(a.classification) -
          CLASSIFICATION_ORDER.indexOf(b.classification) ||
        (b.suggested ?? 0) - (a.suggested ?? 0) ||
        a.category.localeCompare(b.category) ||
        a.size.localeCompare(b.size, 'pt-BR', { numeric: true }),
    );

    const counts = Object.fromEntries(
      CLASSIFICATION_ORDER.map((c) => [c, 0]),
    ) as Record<Classification, number>;
    for (const item of items) counts[item.classification] += 1;
    return {
      hasSales: true,
      params,
      referenceDate: end.toISOString().slice(0, 10),
      historyFrom: range.first.toISOString().slice(0, 10),
      counts,
      totalSuggested: items.reduce((s, i) => s + (i.suggested ?? 0), 0),
      items,
    };
  }
}
