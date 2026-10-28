import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../auth/auth.types';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

const user: AuthUser = {
  id: 'user',
  organizationId: 'org-1',
  role: Role.ADMIN,
  name: 'Admin',
  email: 'admin@teste.com',
};

describe('CategoriesService', () => {
  let service: CategoriesService;
  const prisma = {
    category: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  it('lista só as categorias da empresa, em ordem alfabética', async () => {
    prisma.category.findMany.mockResolvedValue([]);

    await service.findAll(user);

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', active: undefined },
        orderBy: { name: 'asc' },
      }),
    );
  });

  it('busca pelo id dentro da empresa e lança 404 se não achar', async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(service.findOne(user, 'id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id', organizationId: 'org-1' } }),
    );
  });

  it('cria na empresa do usuário', async () => {
    await service.create(user, { name: 'Camisas' });

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { name: 'Camisas', organizationId: 'org-1' },
    });
  });

  it('não exclui categoria com produtos', async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: 'id',
      _count: { products: 2 },
    });

    await expect(service.remove(user, 'id')).rejects.toThrow(
      'A categoria tem produtos',
    );
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('não atualiza nem remove sem antes confirmar que é da empresa', async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(service.update(user, 'id', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(user, 'id')).rejects.toThrow(NotFoundException);
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });
});
