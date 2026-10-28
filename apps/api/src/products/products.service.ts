import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { Page, paging } from '../common/query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  CreateVariantDto,
  QueryProductDto,
  QueryVariantDto,
  StockStatus,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/create-product.dto';
import { compareSizes, SIZE_ORDER } from './size-order';

const productDetail = {
  category: { select: { id: true, name: true, active: true } },
  supplier: { select: { id: true, name: true } },
  variants: true,
} satisfies Prisma.ProductInclude;

// Linha da consulta de estoque (uma por variação).
interface StockRow {
  id: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  min_quantity: number;
  sale_price: string;
  average_cost: string;
  active: boolean;
  status: StockStatus;
  last_movement_at: Date | null;
  product_id: string;
  reference: string;
  name: string;
  product_active: boolean;
  category_id: string | null;
  category_name: string | null;
  total: bigint;
}

// Item da consulta de estoque devolvido pela API.
export interface StockItem {
  id: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  minQuantity: number;
  salePrice: string;
  averageCost: string;
  active: boolean;
  status: StockStatus;
  lastMovementAt: Date | null;
  product: {
    id: string;
    reference: string;
    name: string;
    active: boolean;
    category: { id: string; name: string | null } | null;
  };
}

// Situação do estoque de uma variação: zerado, baixo (no mínimo ou abaixo,
// quando há mínimo) ou normal. O mínimo da variação sobrepõe o do modelo.
export function stockStatus(
  quantity: number,
  minQuantity: number,
): StockStatus {
  if (quantity <= 0) return 'OUT';
  if (minQuantity > 0 && quantity <= minQuantity) return 'LOW';
  return 'NORMAL';
}

// Mesma regra em SQL, para filtrar e contar no banco.
export const STATUS_SQL = Prisma.sql`
  CASE
    WHEN v.quantity <= 0 THEN 'OUT'
    WHEN COALESCE(v.min_quantity, p.min_quantity) > 0
     AND v.quantity <= COALESCE(v.min_quantity, p.min_quantity) THEN 'LOW'
    ELSE 'NORMAL'
  END`;

// Unicidade violada (referência, SKU ou tamanho+cor): 409 com mensagem útil.
function duplicate(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'Já existe produto com esta referência, variação com este SKU ou a mesma combinação de tamanho e cor',
    );
  }
  throw error;
}

// Toda consulta filtra pela loja do usuário: registros de outra organização
// respondem 404, como se não existissem.
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Lista de modelos com o total de peças e de variações de cada um.
  async findAll(user: AuthUser, query: QueryProductDto) {
    const where: Prisma.ProductWhereInput = {
      organizationId: user.organizationId,
      categoryId: query.categoryId,
      active: query.active,
    };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { reference: { contains: query.search, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: query.search } } } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ name: 'asc' }, { reference: 'asc' }],
        ...paging(query),
        include: {
          category: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          variants: {
            select: { quantity: true, minQuantity: true, active: true },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const items = products.map(({ variants, ...product }) => {
      const active = variants.filter((v) => v.active);
      const statuses = active.map((v) =>
        stockStatus(v.quantity, v.minQuantity ?? product.minQuantity),
      );
      return {
        ...product,
        variantCount: active.length,
        totalQuantity: active.reduce((sum, v) => sum + v.quantity, 0),
        lowCount: statuses.filter((s) => s === 'LOW').length,
        outCount: statuses.filter((s) => s === 'OUT').length,
      };
    });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(user: AuthUser, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: user.organizationId },
      include: productDetail,
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }
    return {
      ...product,
      variants: product.variants
        .sort(
          (a, b) =>
            a.color.localeCompare(b.color, 'pt-BR') ||
            compareSizes(a.size, b.size),
        )
        .map((variant) => ({
          ...variant,
          status: stockStatus(
            variant.quantity,
            variant.minQuantity ?? product.minQuantity,
          ),
        })),
    };
  }

  async create(user: AuthUser, dto: CreateProductDto) {
    const { variants = [], supplierName, categoryId, ...data } = dto;
    this.checkVariantList(variants);
    await this.ensureCategory(user, categoryId);

    const { id } = await this.prisma
      .$transaction(async (tx) => {
        const supplierId = await this.supplierId(tx, user, supplierName);
        return tx.product.create({
          data: {
            ...data,
            organizationId: user.organizationId,
            categoryId: categoryId ?? null,
            supplierId,
            variants: {
              create: variants.map((variant) =>
                this.variantData(user, variant),
              ),
            },
          },
          select: { id: true },
        });
      })
      .catch(duplicate);
    return this.findOne(user, id);
  }

  async update(user: AuthUser, id: string, dto: UpdateProductDto) {
    await this.findOne(user, id);
    const { supplierName, ...data } = dto;
    await this.ensureCategory(user, dto.categoryId);

    await this.prisma
      .$transaction(async (tx) => {
        const supplierId =
          supplierName === undefined
            ? undefined
            : await this.supplierId(tx, user, supplierName);
        await tx.product.update({
          where: { id },
          data: { ...data, supplierId },
        });
      })
      .catch(duplicate);
    return this.findOne(user, id);
  }

  // Só exclui modelo cujas variações nunca foram movimentadas; com histórico,
  // o caminho é desativar (active: false), que preserva tudo.
  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    const moved = await this.prisma.stockMovement.count({
      where: { variant: { productId: id } },
    });
    if (moved > 0) {
      throw new ConflictException(
        'Produto com movimentações não pode ser excluído: desative-o',
      );
    }
    await this.prisma.$transaction([
      this.prisma.productVariant.deleteMany({ where: { productId: id } }),
      this.prisma.product.delete({ where: { id } }),
    ]);
  }

  async addVariant(user: AuthUser, productId: string, dto: CreateVariantDto) {
    await this.findOne(user, productId);
    await this.prisma.productVariant
      .create({ data: { ...this.variantData(user, dto), productId } })
      .catch(duplicate);
    return this.findOne(user, productId);
  }

  async updateVariant(user: AuthUser, id: string, dto: UpdateVariantDto) {
    const variant = await this.findVariant(user, id);
    await this.prisma.productVariant
      .update({ where: { id }, data: dto })
      .catch(duplicate);
    return this.findOne(user, variant.productId);
  }

  async removeVariant(user: AuthUser, id: string) {
    const variant = await this.findVariant(user, id);
    const moved = await this.prisma.stockMovement.count({
      where: { variantId: id },
    });
    if (moved > 0) {
      throw new ConflictException(
        'Variação com movimentações não pode ser excluída: desative-a',
      );
    }
    await this.prisma.productVariant.delete({ where: { id } });
    return this.findOne(user, variant.productId);
  }

  // Consulta de estoque: uma linha por variação, com a situação calculada no
  // banco para filtrar, ordenar e paginar juntos.
  async findVariants(
    user: AuthUser,
    query: QueryVariantDto,
  ): Promise<Page<StockItem>> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`v.organization_id = ${user.organizationId}`,
    ];
    if (query.active) {
      conditions.push(Prisma.sql`v.active AND p.active`);
    }
    if (query.categoryId) {
      conditions.push(Prisma.sql`p.category_id = ${query.categoryId}`);
    }
    if (query.productId) {
      conditions.push(Prisma.sql`v.product_id = ${query.productId}`);
    }
    if (query.size !== undefined) {
      conditions.push(Prisma.sql`v.size = ${query.size}`);
    }
    if (query.color !== undefined) {
      conditions.push(Prisma.sql`v.color = ${query.color}`);
    }
    if (query.search) {
      const like = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(Prisma.sql`(
        p.name ILIKE ${like} OR p.reference ILIKE ${like} OR v.sku ILIKE ${like}
      )`);
    }
    if (query.status) {
      conditions.push(Prisma.sql`${STATUS_SQL} = ${query.status}`);
    }

    const order = {
      name: Prisma.sql`p.name, p.reference, v.color, ${SIZE_ORDER}`,
      quantity: Prisma.sql`v.quantity, p.name, v.color, ${SIZE_ORDER}`,
      recent: Prisma.sql`last_movement_at DESC NULLS LAST, p.name, v.color, ${SIZE_ORDER}`,
    }[query.sort];

    const { skip, take } = paging(query);
    const rows = await this.prisma.$queryRaw<StockRow[]>`
      SELECT v.id, v.sku, v.size, v.color, v.quantity, v.active,
             COALESCE(v.min_quantity, p.min_quantity) AS min_quantity,
             COALESCE(v.sale_price, p.sale_price)::text AS sale_price,
             v.average_cost::text AS average_cost,
             ${STATUS_SQL} AS status,
             last.created_at AS last_movement_at,
             p.id AS product_id, p.reference, p.name, p.active AS product_active,
             c.id AS category_id, c.name AS category_name,
             COUNT(*) OVER () AS total
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN LATERAL (
        SELECT m.created_at FROM stock_movements m
        WHERE m.variant_id = v.id
        ORDER BY m.created_at DESC LIMIT 1
      ) last ON true
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${order}
      LIMIT ${take} OFFSET ${skip}`;

    return {
      items: rows.map((row) => ({
        id: row.id,
        sku: row.sku,
        size: row.size,
        color: row.color,
        quantity: row.quantity,
        minQuantity: row.min_quantity,
        salePrice: row.sale_price,
        averageCost: row.average_cost,
        active: row.active,
        status: row.status,
        lastMovementAt: row.last_movement_at,
        product: {
          id: row.product_id,
          reference: row.reference,
          name: row.name,
          active: row.product_active,
          category: row.category_id
            ? { id: row.category_id, name: row.category_name }
            : null,
        },
      })),
      total: rows.length
        ? Number(rows[0].total)
        : await this.countVariants(user, query),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // Tamanhos e cores cadastrados, para os filtros.
  async attributes(user: AuthUser) {
    const [sizes, colors] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { organizationId: user.organizationId, size: { not: '' } },
        distinct: ['size'],
        select: { size: true },
        orderBy: { size: 'asc' },
      }),
      this.prisma.productVariant.findMany({
        where: { organizationId: user.organizationId, color: { not: '' } },
        distinct: ['color'],
        select: { color: true },
        orderBy: { color: 'asc' },
      }),
    ]);
    return {
      sizes: sizes.map((s) => s.size).sort(compareSizes),
      colors: colors.map((c) => c.color),
    };
  }

  // Página além do fim: não há linha para ler o total, então conta à parte.
  private async countVariants(
    user: AuthUser,
    query: QueryVariantDto,
  ): Promise<number> {
    if (query.page === 1) return 0;
    const { items, total } = await this.findVariants(user, {
      ...query,
      page: 1,
    });
    return items.length ? total : 0;
  }

  private async findVariant(user: AuthUser, id: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!variant) {
      throw new NotFoundException('Variação não encontrada');
    }
    return variant;
  }

  private variantData(user: AuthUser, variant: CreateVariantDto) {
    return {
      organizationId: user.organizationId,
      sku: variant.sku,
      size: variant.size ?? '',
      color: variant.color ?? '',
      salePrice: variant.salePrice ?? null,
      minQuantity: variant.minQuantity ?? null,
    };
  }

  // Erros de SKU ou combinação repetidos dentro do mesmo envio, antes do banco.
  private checkVariantList(variants: CreateVariantDto[]) {
    const skus = new Set<string>();
    const combos = new Set<string>();
    for (const variant of variants) {
      const combo = `${variant.size ?? ''}|${variant.color ?? ''}`;
      if (skus.has(variant.sku)) {
        throw new BadRequestException(`SKU ${variant.sku} repetido`);
      }
      if (combos.has(combo)) {
        throw new BadRequestException(
          `Combinação repetida: ${variant.size || 'sem tamanho'} / ${variant.color || 'sem cor'}`,
        );
      }
      skus.add(variant.sku);
      combos.add(combo);
    }
  }

  // A chave estrangeira só garante que a categoria existe; aqui garantimos
  // que ela é da mesma loja e está ativa.
  private async ensureCategory(user: AuthUser, categoryId?: string | null) {
    if (!categoryId) return;
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, organizationId: user.organizationId },
      select: { active: true },
    });
    if (!category) {
      throw new BadRequestException('Categoria não encontrada');
    }
    if (!category.active) {
      throw new BadRequestException('Categoria desativada');
    }
  }

  // Fornecedor pelo nome (sem diferenciar maiúsculas); cria se não existir.
  private async supplierId(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    name: string | null | undefined,
  ) {
    if (!name) return null;
    const existing = await tx.supplier.findFirst({
      where: {
        organizationId: user.organizationId,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await tx.supplier.create({
      data: { organizationId: user.organizationId, name },
      select: { id: true },
    });
    return created.id;
  }
}
