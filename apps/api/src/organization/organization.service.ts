import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const organizationFields = {
  id: true,
  name: true,
  cnpj: true,
  createdAt: true,
} as const;

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  findOne(user: AuthUser) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: organizationFields,
    });
  }

  update(user: AuthUser, dto: UpdateOrganizationDto) {
    return this.prisma.organization.update({
      where: { id: user.organizationId },
      data: dto,
      select: organizationFields,
    });
  }
}
