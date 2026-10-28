import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Response } from 'express';
import { Prisma } from '../generated/prisma/client';

// Traduz os erros conhecidos do Prisma em respostas HTTP; os demais seguem como 500.
const ERRORS: Record<string, { status: HttpStatus; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Registro duplicado' },
  P2003: {
    status: HttpStatus.CONFLICT,
    message: 'Registro relacionado inexistente ou em uso',
  },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Registro não encontrado' },
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const known = ERRORS[exception.code];
    const status = known?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

    // Código que não sabemos traduzir é um erro de verdade: vai para o log
    // e para o Sentry (se configurado).
    if (!known) {
      this.logger.error(exception.message, exception.stack);
      Sentry.captureException(exception);
    }

    response.status(status).json({
      statusCode: status,
      message: known?.message ?? 'Erro interno no banco de dados',
      code: exception.code,
    });
  }
}
