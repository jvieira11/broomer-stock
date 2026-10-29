import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../../auth/auth.types';
import {
  MovementType,
  OperationType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ErpStockReport,
  parseErpStockReport,
  ReportFormatError,
  ReportIssue,
} from './erp-stock-report';

const MAX_ISSUES = 300;

// Fim do dia do relatório, no horário de Maceió (UTC-3): o "estoque final do
// dia" vale para o fechamento daquele dia.
const endOfDay = (date: string) => new Date(`${date}T23:59:59-03:00`);

// Carga inicial a partir do relatório "estoque final do dia" do ERP.
// Em duas etapas: a prévia lê e valida sem gravar nada; a confirmação reenvia
// o mesmo arquivo (conferido pelo hash) e grava tudo numa transação.
@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(user: AuthUser, buffer: Buffer) {
    const report = this.parse(buffer);
    const conflicts = await this.conflicts(user, report);
    return this.summary(report, conflicts);
  }

  async confirm(user: AuthUser, buffer: Buffer, expectedHash: string) {
    const report = this.parse(buffer);
    if (report.fileHash !== expectedHash) {
      throw new BadRequestException(
        'O arquivo enviado não é o mesmo da prévia. Gere a prévia de novo.',
      );
    }
    const conflicts = await this.conflicts(user, report);
    if (report.errors.length || conflicts.length) {
      throw new BadRequestException({
        message:
          'A planilha tem problemas que impedem a importação. Gere a prévia para ver a lista.',
        errors: [...report.errors, ...conflicts].slice(0, MAX_ISSUES),
      });
    }
    if (!report.reportDate) {
      throw new BadRequestException(
        'O relatório não informa o dia (linha "DIA: dd/mm/aaaa").',
      );
    }

    try {
      return await this.prisma.$transaction(
        (tx) => this.write(tx, user, report),
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (error) {
      // Outra importação do mesmo arquivo terminou antes desta.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Esta planilha (ou parte dela) já foi importada.',
        );
      }
      throw error;
    }
  }

  private parse(buffer: Buffer) {
    try {
      return parseErpStockReport(buffer);
    } catch (error) {
      if (error instanceof ReportFormatError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  // Referências e SKUs que já existem: a carga não sobrescreve cadastros.
  private async conflicts(user: AuthUser, report: ErpStockReport) {
    const references = report.models.map((m) => m.reference);
    const skus = report.models.flatMap((m) => m.variants.map((v) => v.sku));
    const [products, variants] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          organizationId: user.organizationId,
          reference: { in: references },
        },
        select: { reference: true },
      }),
      this.prisma.productVariant.findMany({
        where: { organizationId: user.organizationId, sku: { in: skus } },
        select: { sku: true },
      }),
    ]);
    const issues: ReportIssue[] = [
      ...products.map((p) => ({
        message: `Referência ${p.reference} já está cadastrada.`,
      })),
      ...variants.map((v) => ({
        sku: v.sku,
        message: `SKU ${v.sku} já está cadastrado.`,
      })),
    ];
    return issues;
  }

  private summary(report: ErpStockReport, conflicts: ReportIssue[]) {
    const variants = report.models.flatMap((m) => m.variants);
    const categories = new Map<string, number>();
    for (const model of report.models) {
      const name = model.category ?? 'Sem categoria';
      categories.set(name, (categories.get(name) ?? 0) + 1);
    }
    const errors = [...report.errors, ...conflicts];
    return {
      fileHash: report.fileHash,
      reportDate: report.reportDate,
      store: report.store,
      columns: report.columns,
      canImport: errors.length === 0 && report.reportDate !== null,
      totals: {
        rows: report.rowCount,
        models: report.models.length,
        variants: variants.length,
        pieces: variants.reduce((sum, v) => sum + v.quantity, 0),
        reportTotal: report.reportTotal,
        withStock: variants.filter((v) => v.quantity > 0).length,
        zero: variants.filter((v) => v.reportQuantity === 0).length,
        negative: variants.filter((v) => v.reportQuantity < 0).length,
        priceOverrides: variants.filter((v) => v.priceOverride !== null).length,
        withoutPrice: variants.filter((v) => v.salePrice === null).length,
        withoutCost: variants.filter(
          (v) => v.quantity > 0 && v.unitCost === null,
        ).length,
        suppliers: new Set(report.models.map((m) => m.supplier).filter(Boolean))
          .size,
      },
      categories: [...categories]
        .map(([name, models]) => ({ name, models }))
        .sort((a, b) => b.models - a.models),
      normalizations: report.normalizations,
      warnings: report.warnings.slice(0, MAX_ISSUES),
      warningCount: report.warnings.length,
      errors: errors.slice(0, MAX_ISSUES),
      errorCount: errors.length,
      sample: report.models.slice(0, 15).map((m) => ({
        reference: m.reference,
        name: m.name,
        category: m.category,
        supplier: m.supplier,
        salePrice: m.salePrice.toFixed(2),
        variants: m.variants.map((v) => ({
          sku: v.sku,
          size: v.size,
          color: v.color,
          quantity: v.quantity,
        })),
      })),
    };
  }

  private async write(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    report: ErpStockReport,
  ) {
    const organizationId = user.organizationId;
    const categoryIds = await this.ensureNamed(
      tx,
      'category',
      organizationId,
      report.models.map((m) => m.category),
    );
    const supplierIds = await this.ensureNamed(
      tx,
      'supplier',
      organizationId,
      report.models.map((m) => m.supplier),
    );

    const products: Prisma.ProductCreateManyInput[] = [];
    const variants: Prisma.ProductVariantCreateManyInput[] = [];
    const movements: Omit<
      Prisma.StockMovementCreateManyInput,
      'operationId'
    >[] = [];

    for (const model of report.models) {
      const productId = randomUUID();
      products.push({
        id: productId,
        organizationId,
        reference: model.reference,
        name: model.name,
        collection: model.collection,
        fit: model.fit,
        salePrice: model.salePrice,
        categoryId: model.category
          ? categoryIds.get(model.category.toLowerCase())
          : null,
        supplierId: model.supplier
          ? supplierIds.get(model.supplier.toLowerCase())
          : null,
      });
      for (const variant of model.variants) {
        const variantId = randomUUID();
        const unitCost = variant.unitCost ?? 0;
        variants.push({
          id: variantId,
          organizationId,
          productId,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          salePrice: variant.priceOverride,
          quantity: variant.quantity,
          averageCost: unitCost,
        });
        if (variant.quantity > 0) {
          movements.push({
            organizationId,
            variantId,
            userId: user.id,
            type: MovementType.IN,
            quantity: variant.quantity,
            balanceBefore: 0,
            balanceAfter: variant.quantity,
            unitCost,
          });
        }
      }
    }

    const [day, month, year] = [
      report.reportDate!.slice(8, 10),
      report.reportDate!.slice(5, 7),
      report.reportDate!.slice(0, 4),
    ];
    const operation = await tx.stockOperation.create({
      data: {
        organizationId,
        userId: user.id,
        type: OperationType.INITIAL_LOAD,
        occurredAt: endOfDay(report.reportDate!),
        origin: `Relatório "estoque final do dia" do ERP${report.store ? ` (loja ${report.store})` : ''}`,
        reason: `Carga inicial: estoque de ${day}/${month}/${year}`,
        notes: `Arquivo sha256 ${report.fileHash}. Saldos negativos do relatório entraram como 0: ${report.warnings.filter((w) => w.sku).length}.`,
        idempotencyKey: `import:${report.fileHash}`,
      },
    });

    await tx.product.createMany({ data: products });
    await tx.productVariant.createMany({ data: variants });
    await tx.stockMovement.createMany({
      data: movements.map((m) => ({ ...m, operationId: operation.id })),
    });

    return {
      operation: { id: operation.id, number: operation.number },
      products: products.length,
      variants: variants.length,
      pieces: movements.reduce((sum, m) => sum + m.quantity, 0),
      categoriesCreated: categoryIds.created,
      suppliersCreated: supplierIds.created,
    };
  }

  // Reaproveita categorias/fornecedores pelo nome (sem diferenciar
  // maiúsculas) e cria os que faltam.
  private async ensureNamed(
    tx: Prisma.TransactionClient,
    kind: 'category' | 'supplier',
    organizationId: string,
    names: (string | null)[],
  ) {
    const ids = new Map<string, string>() as Map<string, string> & {
      created: number;
    };
    ids.created = 0;
    const delegate = (kind === 'category'
      ? tx.category
      : tx.supplier) as unknown as {
      findMany(args: object): Promise<{ id: string; name: string }[]>;
      create(args: object): Promise<{ id: string }>;
    };
    for (const existing of await delegate.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    })) {
      ids.set(existing.name.toLowerCase(), existing.id);
    }
    for (const name of new Set(names.filter((n): n is string => !!n))) {
      if (ids.has(name.toLowerCase())) continue;
      const created = await delegate.create({
        data: { organizationId, name },
        select: { id: true },
      });
      ids.set(name.toLowerCase(), created.id);
      ids.created += 1;
    }
    return ids;
  }
}
