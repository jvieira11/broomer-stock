import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const withCount = { _count: { select: { products: true } } } as const;

// Toda consulta filtra pela loja do usuário: registros de outra organização
// respondem 404, como se não existissem.
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthUser, query: QueryCategoryDto = {}) {
    const where: Prisma.CategoryWhereInput = {
      organizationId: user.organizationId,
      active: query.active,
    };
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    return this.prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
      include: withCount,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, organizationId: user.organizationId },
      include: withCount,
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
    return category;
  }

  create(user: AuthUser, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: { ...dto, organizationId: user.organizationId },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateCategoryDto) {
    await this.findOne(user, id);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  // Só exclui categoria sem produtos; com produtos, o caminho é desativá-la.
  async remove(user: AuthUser, id: string) {
    const category = await this.findOne(user, id);
    if (category._count.products > 0) {
      throw new ConflictException(
        'A categoria tem produtos: desative-a ou mova os produtos antes de excluir',
      );
    }
    await this.prisma.category.delete({ where: { id } });
  }
}
