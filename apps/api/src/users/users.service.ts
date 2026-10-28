import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { hashPassword } from '../auth/password';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const userFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(current: AuthUser) {
    return this.prisma.user.findMany({
      where: { organizationId: current.organizationId },
      orderBy: { name: 'asc' },
      select: userFields,
    });
  }

  async create(current: AuthUser, dto: CreateUserDto) {
    await this.ensureEmailFree(dto.email);
    const { password, ...data } = dto;

    return this.prisma.user.create({
      data: {
        ...data,
        passwordHash: await hashPassword(password),
        organizationId: current.organizationId,
      },
      select: userFields,
    });
  }

  async update(current: AuthUser, id: string, dto: UpdateUserDto) {
    const user = await this.findInOrganization(current, id);

    if (id === current.id && (dto.role || dto.active === false)) {
      throw new BadRequestException(
        'Você não pode mudar o próprio papel nem se desativar',
      );
    }
    const losesAdmin =
      user.role === Role.ADMIN &&
      user.active &&
      ((dto.role && dto.role !== Role.ADMIN) || dto.active === false);
    if (losesAdmin) await this.ensureAnotherAdmin(current, id);

    if (dto.email && dto.email !== user.email) {
      await this.ensureEmailFree(dto.email);
    }

    const { password, ...data } = dto;
    return this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        // Senha nova definida pelo administrador: a pessoa sai dos aparelhos.
        ...(password && {
          passwordHash: await hashPassword(password),
          sessionVersion: { increment: 1 },
        }),
      },
      select: userFields,
    });
  }

  private async findInOrganization(current: AuthUser, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: current.organizationId },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  // A empresa nunca pode ficar sem um administrador ativo.
  private async ensureAnotherAdmin(current: AuthUser, exceptId: string) {
    const others = await this.prisma.user.count({
      where: {
        organizationId: current.organizationId,
        role: Role.ADMIN,
        active: true,
        id: { not: exceptId },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        'A empresa precisa de pelo menos um administrador ativo',
      );
    }
  }

  private async ensureEmailFree(email: string) {
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }
  }
}
