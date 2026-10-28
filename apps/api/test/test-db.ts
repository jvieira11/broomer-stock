import 'dotenv/config';

// Os testes e2e usam um banco separado: o mesmo DATABASE_URL com o sufixo _test.
export function getTestDatabaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL não definida no .env');
  }
  const url = new URL(base);
  const name = url.pathname.slice(1);
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}
