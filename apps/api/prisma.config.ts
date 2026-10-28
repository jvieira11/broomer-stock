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
    url: process.env.DATABASE_URL,
  },
});
