import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsHexadecimal, Length } from 'class-validator';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser, Roles } from '../../auth/decorators';
import { Role } from '../../generated/prisma/client';
import { ImportService } from './import.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export class ConfirmImportDto {
  @IsHexadecimal()
  @Length(64, 64)
  fileHash: string;
}

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

// Carga inicial do estoque: só o administrador (cria centenas de produtos e
// define saldos de uma vez).
@Controller('products/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @Roles(Role.ADMIN)
  @UseInterceptors(upload)
  preview(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.importService.preview(user, requireFile(file));
  }

  @Post()
  @Roles(Role.ADMIN)
  @UseInterceptors(upload)
  confirm(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ConfirmImportDto,
  ) {
    return this.importService.confirm(user, requireFile(file), dto.fileHash);
  }
}
