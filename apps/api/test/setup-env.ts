import { getTestDatabaseUrl } from './test-db';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET ??= 'segredo-dos-testes';
// Os testes fazem muitos cadastros; o limite de tentativas tem teste próprio.
process.env.AUTH_RATE_LIMIT = '10000';
