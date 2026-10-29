import { createAdmin } from '../src/scripts/create-admin';

// pnpm --filter api db:seed: o código fica em src/scripts para também ser
// compilado e rodar na imagem de produção.
createAdmin().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
