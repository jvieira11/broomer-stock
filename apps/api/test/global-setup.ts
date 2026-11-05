import { execSync } from 'node:child_process';
import { getTestDatabaseUrl } from './test-db';

// Limpa só as tabelas que já existem (o banco pode estar numa migration antiga).
const CLEAR_DATA = `
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_order_items', 'purchase_orders', 'purchase_settings', 'stock_movements', 'stock_operations', 'product_variants', 'products', 'suppliers', 'categories', 'password_reset_tokens', 'users', 'organizations'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE %I CASCADE', t);
    END IF;
  END LOOP;
END $$;`;

// Antes dos testes: limpa os dados deixados pela execução anterior (para que
// migrations novas com colunas obrigatórias possam ser aplicadas) e aplica as
// migrations. O banco de teste é criado pelo migrate deploy se ainda não existir.
export default function globalSetup() {
  const url = getTestDatabaseUrl();
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('globalSetup só pode rodar no banco de teste');
  }

  const options = {
    cwd: `${__dirname}/..`,
    // As conexões diretas também: o prisma.config.ts as prefere à DATABASE_URL.
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
      DATABASE_URL_UNPOOLED: url,
    },
  };

  try {
    execSync('pnpm exec prisma db execute --stdin', {
      ...options,
      input: CLEAR_DATA,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
  } catch {
    // Banco de teste ainda não existe: o migrate deploy cria.
  }

  execSync('pnpm exec prisma migrate deploy', { ...options, stdio: 'ignore' });
}
