import 'dotenv/config';

// Bancos em que os testes podem rodar. Os testes apagam o banco que usam:
// apontar o .env para um banco na nuvem (ex.: Neon) não pode virar teste lá.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', 'postgres'];

// Os testes e2e usam um banco separado: o mesmo DATABASE_URL com o sufixo _test.
export function getTestDatabaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL não definida no .env');
  }
  const url = new URL(base);
  if (
    !LOCAL_HOSTS.includes(url.hostname) &&
    process.env.E2E_ALLOW_REMOTE_DB !== '1'
  ) {
    throw new Error(
      `Os testes e2e só rodam num Postgres local, não em ${url.hostname}. ` +
        'Use o banco do Docker (pnpm db:up) ou defina E2E_ALLOW_REMOTE_DB=1 ' +
        'se o servidor for só de testes.',
    );
  }
  const name = url.pathname.slice(1);
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}
