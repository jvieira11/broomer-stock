import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { SanitizeInputPipe } from './common/sanitize-input.pipe';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new SanitizeInputPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // O Nest testa os filtros do último para o primeiro: erros conhecidos do
  // Prisma viram 404/409; o resto cai no filtro do Sentry, que registra os
  // erros inesperados (500) e responde como o Nest responderia.
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(
    new SentryGlobalFilter(httpAdapter),
    new PrismaExceptionFilter(),
  );

  return app;
}
