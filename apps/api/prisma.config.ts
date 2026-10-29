import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // process.env em vez de env(): gerar o cliente (postinstall) não precisa
    // de banco, e assim `pnpm install` funciona sem .env (ex.: no CI do web).
    // Comandos que acessam o banco avisam se a variável faltar.
    // Com banco gerenciado (Neon), as migrations usam a conexão direta e a
    // API usa a do pooler (DATABASE_URL). A direta vem em DIRECT_URL (compose)
    // ou DATABASE_URL_UNPOOLED (nome usado pelo `neon env pull`). Sem nenhuma
    // das duas, vale DATABASE_URL.
    url:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.DATABASE_URL,
  },
});
