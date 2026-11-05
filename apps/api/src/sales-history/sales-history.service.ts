import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseSalesReport,
  SalesReportFormatError,
  type ReportIssue,
} from './sales-report';

const MAX_ISSUES = 50;
const CHUNK = 2000;

// Categoria = primeira palavra da descrição ("ZZ" é prefixo do ERP).
const CATEGORY_SQL = Prisma.sql`
  CASE WHEN upper(split_part(description, ' ', 1)) = 'ZZ'
       THEN upper(split_part(description, ' ', 2))
       ELSE upper(split_part(description, ' ', 1)) END`;

const day = (iso: string) => iso.split('-').reverse().join('/');

@Injectable()
export class SalesHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private read(buffer: Buffer) {
    try {
      return parseSalesReport(buffer);
    } catch (error) {
      if (error instanceof SalesReportFormatError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // Importações já feitas que cobrem o mesmo período (ou o mesmo arquivo).
  private async conflicts(
    user: AuthUser,
    fileHash: string,
    from: string,
    to: string,
  ): Promise<ReportIssue[]> {
    const found = await this.prisma.salesImport.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [
          { fileHash },
          {
            periodFrom: { lte: new Date(`${to}T00:00:00Z`) },
            periodTo: { gte: new Date(`${from}T00:00:00Z`) },
          },
        ],
      },
      select: { fileHash: true, periodFrom: true, periodTo: true },
    });
    return found.map((item) => ({
      message:
        item.fileHash === fileHash
          ? 'Este arquivo já foi importado.'
          : `O período ${day(item.periodFrom.toISOString().slice(0, 10))} a ${day(item.periodTo.toISOString().slice(0, 10))} já tem vendas importadas. Remova essa importação antes de importar de novo.`,
    }));
  }

  async preview(user: AuthUser, buffer: Buffer) {
    const report = this.read(buffer);
    const errors = [...report.errors];
    if (report.periodFrom && report.periodTo && errors.length === 0) {
      errors.push(
        ...(await this.conflicts(
          user,
          report.fileHash,
          report.periodFrom,
          report.periodTo,
        )),
      );
    }

    const months = new Map<string, { pieces: number; total: number }>();
    const sellers = new Set<string>();
    for (const row of report.rows) {
      sellers.add(row.seller);
      const key = row.soldOn.slice(0, 7);
      const entry = months.get(key) ?? { pieces: 0, total: 0 };
      entry.pieces += row.quantity;
      entry.total += row.total;
      months.set(key, entry);
    }
    return {
      fileHash: report.fileHash,
      store: report.store,
      periodFrom: report.periodFrom,
      periodTo: report.periodTo,
      columns: report.columns,
      canImport: errors.length === 0 && report.periodFrom !== null,
      lineCount: report.rows.length,
      totals: report.totals,
      reportTotals: report.reportTotals,
      sellers: sellers.size,
      months: [...months]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, value]) => ({
          month,
          pieces: value.pieces,
          total: Math.round(value.total * 100) / 100,
        })),
      warnings: report.warnings.slice(0, MAX_ISSUES),
      warningCount: report.warnings.length,
      errors: errors.slice(0, MAX_ISSUES),
      errorCount: errors.length,
    };
  }

  async confirm(user: AuthUser, buffer: Buffer, fileHash: string) {
    const report = this.read(buffer);
    if (report.fileHash !== fileHash) {
      throw new BadRequestException(
        'O arquivo mudou desde a prévia. Gere a prévia de novo.',
      );
    }
    const conflicts =
      report.periodFrom && report.periodTo
        ? await this.conflicts(
            user,
            report.fileHash,
            report.periodFrom,
            report.periodTo,
          )
        : [];
    if (report.errors.length || conflicts.length || !report.periodFrom) {
      throw new BadRequestException({
        message: 'O relatório tem problemas: corrija antes de importar.',
        errors: [...report.errors, ...conflicts].slice(0, MAX_ISSUES),
      });
    }
    const periodFrom = report.periodFrom;
    const periodTo = report.periodTo ?? periodFrom;

    return this.prisma.$transaction(
      async (tx) => {
        let created: { id: string };
        try {
          created = await tx.salesImport.create({
            data: {
              organizationId: user.organizationId,
              userId: user.id,
              fileHash: report.fileHash,
              periodFrom: new Date(`${periodFrom}T00:00:00Z`),
              periodTo: new Date(`${periodTo}T00:00:00Z`),
              store: report.store,
              lineCount: report.rows.length,
              pieces: report.totals.pieces,
              total: new Prisma.Decimal(report.totals.total),
            },
          });
        } catch (error) {
          // Dois envios simultâneos do mesmo arquivo: o índice único barra o segundo.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new ConflictException('Este arquivo já foi importado.');
          }
          throw error;
        }
        for (let start = 0; start < report.rows.length; start += CHUNK) {
          await tx.saleLine.createMany({
            data: report.rows.slice(start, start + CHUNK).map((row) => ({
              importId: created.id,
              organizationId: user.organizationId,
              soldOn: new Date(`${row.soldOn}T00:00:00Z`),
              seller: row.seller,
              description: row.description,
              size: row.size,
              code: row.code,
              unitPrice: row.unitPrice,
              quantity: row.quantity,
              discount: row.discount,
              cost: row.cost,
              returned: row.returned,
              total: row.total,
              isReturn: row.isReturn,
            })),
          });
        }
        return {
          id: created.id,
          lineCount: report.rows.length,
          pieces: report.totals.pieces,
          total: report.totals.total,
          periodFrom,
          periodTo,
        };
      },
      { timeout: 120_000 },
    );
  }

  imports(user: AuthUser) {
    return this.prisma.salesImport.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { periodFrom: 'desc' },
      select: {
        id: true,
        periodFrom: true,
        periodTo: true,
        store: true,
        lineCount: true,
        pieces: true,
        total: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    });
  }

  // Remove uma importação (e só as linhas dela). Não mexe no estoque.
  async remove(user: AuthUser, id: string) {
    const found = await this.prisma.salesImport.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Importação não encontrada');
    await this.prisma.salesImport.delete({ where: { id } });
  }

  // Análise do histórico importado (todos os números saem do banco).
  async summary(
    user: AuthUser,
    query: { from?: string; to?: string; category?: string },
  ) {
    const org = user.organizationId;
    const conditions = [Prisma.sql`organization_id = ${org}`];
    if (query.from) {
      conditions.push(Prisma.sql`sold_on >= ${query.from}::date`);
    }
    if (query.to) conditions.push(Prisma.sql`sold_on <= ${query.to}::date`);
    const scope = Prisma.join(conditions, ' AND ');
    const withCategory = query.category
      ? Prisma.sql`${scope} AND ${CATEGORY_SQL} = ${query.category.toUpperCase()}`
      : scope;

    const [[totals], months, categories, sizes, products, sellers, coverage] =
      await Promise.all([
        this.prisma.$queryRaw<
          {
            sold: number;
            returned: number;
            revenue: string;
            gross: string;
            discount: string;
            cost: string;
            returns_value: string;
            lines: number;
          }[]
        >`
          SELECT COALESCE(SUM(quantity) FILTER (WHERE quantity > 0), 0)::int AS sold,
                 COALESCE(-SUM(quantity) FILTER (WHERE quantity < 0), 0)::int AS returned,
                 COALESCE(SUM(total), 0)::numeric(14,2)::text AS revenue,
                 COALESCE(SUM(unit_price * quantity), 0)::numeric(14,2)::text AS gross,
                 COALESCE(SUM(discount), 0)::numeric(14,2)::text AS discount,
                 COALESCE(SUM(cost), 0)::numeric(14,2)::text AS cost,
                 COALESCE(SUM(returned), 0)::numeric(14,2)::text AS returns_value,
                 COUNT(*)::int AS lines
          FROM sale_lines WHERE ${withCategory}`,
        this.prisma.$queryRaw<
          { month: string; pieces: number; revenue: string; margin: string }[]
        >`
          SELECT to_char(sold_on, 'YYYY-MM') AS month,
                 SUM(quantity)::int AS pieces,
                 SUM(total)::numeric(14,2)::text AS revenue,
                 (SUM(total) - SUM(cost))::numeric(14,2)::text AS margin
          FROM sale_lines WHERE ${withCategory}
          GROUP BY 1 ORDER BY 1`,
        this.prisma.$queryRaw<
          {
            category: string;
            pieces: number;
            revenue: string;
            margin: string;
          }[]
        >`
          SELECT ${CATEGORY_SQL} AS category,
                 SUM(quantity)::int AS pieces,
                 SUM(total)::numeric(14,2)::text AS revenue,
                 (SUM(total) - SUM(cost))::numeric(14,2)::text AS margin
          FROM sale_lines WHERE ${scope}
          GROUP BY 1 HAVING SUM(quantity) > 0 ORDER BY 2 DESC LIMIT 20`,
        this.prisma.$queryRaw<{ size: string; pieces: number }[]>`
          SELECT size, SUM(quantity)::int AS pieces
          FROM sale_lines WHERE ${withCategory}
          GROUP BY size HAVING SUM(quantity) > 0 ORDER BY 2 DESC`,
        this.prisma.$queryRaw<
          { description: string; pieces: number; revenue: string }[]
        >`
          SELECT description, SUM(quantity)::int AS pieces,
                 SUM(total)::numeric(14,2)::text AS revenue
          FROM sale_lines WHERE ${withCategory}
          GROUP BY description HAVING SUM(quantity) > 0
          ORDER BY 2 DESC, 1 LIMIT 15`,
        this.prisma.$queryRaw<
          { seller: string; pieces: number; revenue: string }[]
        >`
          SELECT seller, SUM(quantity)::int AS pieces,
                 SUM(total)::numeric(14,2)::text AS revenue
          FROM sale_lines WHERE ${withCategory}
          GROUP BY seller ORDER BY 3 DESC`.then((rows) =>
          rows.sort((a, b) => Number(b.revenue) - Number(a.revenue)),
        ),
        this.prisma.$queryRaw<{ first: Date | null; last: Date | null }[]>`
          SELECT MIN(sold_on) AS first, MAX(sold_on) AS last
          FROM sale_lines WHERE organization_id = ${org}`,
      ]);

    const revenue = Number(totals.revenue);
    const cost = Number(totals.cost);
    const gross = Number(totals.gross);
    return {
      coverage: {
        first: coverage[0]?.first?.toISOString().slice(0, 10) ?? null,
        last: coverage[0]?.last?.toISOString().slice(0, 10) ?? null,
      },
      category: query.category?.toUpperCase() ?? null,
      totals: {
        soldPieces: totals.sold,
        returnedPieces: totals.returned,
        netPieces: totals.sold - totals.returned,
        revenue: totals.revenue,
        discount: totals.discount,
        // Desconto sobre o valor de tabela das peças (vendas menos devoluções).
        discountRate: gross > 0 ? Number(totals.discount) / gross : 0,
        cost: totals.cost,
        margin: (revenue - cost).toFixed(2),
        marginRate: revenue > 0 ? (revenue - cost) / revenue : 0,
        returnsValue: totals.returns_value,
        lines: totals.lines,
      },
      months,
      categories,
      sizes,
      products,
      sellers,
    };
  }
}
