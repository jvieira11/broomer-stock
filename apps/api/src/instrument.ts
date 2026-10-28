import * as Sentry from '@sentry/nestjs';

// Precisa ser importado antes de tudo no main.ts. Sem SENTRY_DSN, o Sentry
// fica desligado e os erros vão só para o log.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Só erros; rastreamento de performance pode ser ligado depois.
    tracesSampleRate: 0,
  });
}
