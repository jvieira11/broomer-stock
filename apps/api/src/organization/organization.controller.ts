import { Body, Controller, Get, Patch, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/client';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ExportService } from './export.service';
import { OrganizationService } from './organization.service';

@Controller('organization')
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly exportService: ExportService,
  ) {}

  @Get()
  findOne(@CurrentUser() user: AuthUser) {
    return this.organizationService.findOne(user);
  }

  @Patch()
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateOrganizationDto) {
    return this.organizationService.update(user, dto);
  }

  // Só o administrador: a planilha inclui a lista de usuários e e-mails.
  @Get('export')
  @Roles(Role.ADMIN)
  async export(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="broomer-estoque-${date}.xlsx"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    await this.exportService.write(user, res);
  }
}
