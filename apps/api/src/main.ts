// Precisa vir antes de qualquer outro import para o Sentry capturar tudo.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  configureApp(app);
  app.use(helmet());

  // Atrás de um proxy (Caddy, Nginx, load balancer), req.ip seria o IP do
  // proxy e o limite de tentativas de login trataria todos como um só.
  // TRUST_PROXY = número de proxies na frente da API (ex.: 1).
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY));
  }

  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // Fecha conexões com o banco direito quando o container é parado.
  app.enableShutdownHooks();

  await app.listen(process.env.API_PORT ?? 3333);
}
void bootstrap();
