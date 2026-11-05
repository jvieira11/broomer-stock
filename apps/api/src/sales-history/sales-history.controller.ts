import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../auth/auth.types';
import { CAN_EDIT_CATALOG, CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../generated/prisma/client';
import { ConfirmSalesImportDto, SalesSummaryQueryDto } from './dto';
import { SalesHistoryService } from './sales-history.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const upload = FileInterceptor('file', {
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

function requireFile(file: Express.Multer.File | undefined) {
  if (!file || file.size === 0) {
    throw new BadRequestException('Envie o relatório (.xls ou .xlsx)');
  }
  if (!/\.(xls|xlsx)$/i.test(file.originalname)) {
    throw new BadRequestException(
      'Formato não aceito. Envie o relatório exportado pelo ERP (.xls ou .xlsx).',
    );
  }
  return file.buffer;
}

// Histórico de vendas importado: traz custo, margem e vendedores, então fica
// com administrador e gerente. A importação não altera o estoque.
@Controller('sales-history')
@Roles(...CAN_EDIT_CATALOG)
export class SalesHistoryController {
  constructor(private readonly service: SalesHistoryService) {}

  @Post('import/preview')
  @UseInterceptors(upload)
  preview(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.service.preview(user, requireFile(file));
  }

  @Post('import')
  @UseInterceptors(upload)
  confirm(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ConfirmSalesImportDto,
  ) {
    return this.service.confirm(user, requireFile(file), dto.fileHash);
  }

  @Get('imports')
  imports(@CurrentUser() user: AuthUser) {
    return this.service.imports(user);
  }

  @Delete('imports/:id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user, id);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: SalesSummaryQueryDto) {
    return this.service.summary(user, query);
  }
}
