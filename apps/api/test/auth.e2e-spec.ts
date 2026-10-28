import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  client,
  createTestApp,
  resetDatabase,
  signUp,
  TEST_PASSWORD,
} from './utils';

describe('Autenticação (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(() => resetDatabase(prisma));

  afterAll(async () => {
    await app.close();
  });

  const anonymous = () => client(app);

  it('não há cadastro público', async () => {
    await anonymous()
      .post('/api/auth/register', {
        organizationName: 'Outra loja',
        name: 'Fulano',
        email: 'fulano@teste.com',
        password: TEST_PASSWORD,
      })
      .expect(404);
    expect(await prisma.user.count()).toBe(0);
  });

  it('senha criada pelo administrador nunca é devolvida nem guardada em texto puro', async () => {
    const admin = await signUp(app);
    const res = await admin.api
      .post('/api/users', {
        name: 'Maria',
        email: '  Maria@Exemplo.com ',
        password: TEST_PASSWORD,
        role: 'OPERATOR',
      })
      .expect(201);

    expect(JSON.stringify(res.body)).not.toContain(TEST_PASSWORD);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: 'maria@exemplo.com' },
    });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
  });

  it('login devolve token; erros não revelam se o e-mail existe', async () => {
    const { email } = await signUp(app);

    const ok = await anonymous()
      .post('/api/auth/login', {
        email: email.toUpperCase(),
        password: TEST_PASSWORD,
      })
      .expect(201);
    await client(app, (ok.body as { token: string }).token)
      .get('/api/auth/me')
      .expect(200);

    const wrongPassword = await anonymous()
      .post('/api/auth/login', { email, password: 'senha-errada-123' })
      .expect(401);
    const unknownEmail = await anonymous()
      .post('/api/auth/login', {
        email: 'ninguem@teste.com',
        password: TEST_PASSWORD,
      })
      .expect(401);
    const message = (res: { body: unknown }) =>
      (res.body as { message: string }).message;
    expect(message(wrongPassword)).toBe('E-mail ou senha incorretos');
    expect(message(unknownEmail)).toBe(message(wrongPassword));
  });

  it('rotas protegidas exigem token válido', async () => {
    await anonymous().get('/api/products').expect(401);
    await anonymous().get('/api/auth/me').expect(401);
    await client(app, 'token-invalido').get('/api/products').expect(401);
    // A rota de saúde continua pública.
    await anonymous()
      .get('/api/health')
      .expect(200, { status: 'ok', database: 'ok' });
  });

  it('usuário desativado perde o acesso na hora, mesmo com token válido', async () => {
    const admin = await signUp(app);
    await admin.api.get('/api/products').expect(200);

    await prisma.user.update({
      where: { id: admin.userId },
      data: { active: false },
    });

    await admin.api.get('/api/products').expect(401);
    await anonymous()
      .post('/api/auth/login', { email: admin.email, password: TEST_PASSWORD })
      .expect(401);
  });

  it('limita tentativas de login por minuto', async () => {
    const previous = process.env.AUTH_RATE_LIMIT;
    process.env.AUTH_RATE_LIMIT = '3';
    const { app: limited, prisma: limitedPrisma } = await createTestApp();
    process.env.AUTH_RATE_LIMIT = previous;

    try {
      const attempt = () =>
        client(limited).post('/api/auth/login', {
          email: 'x@teste.com',
          password: 'qualquer-coisa',
        });
      await attempt().expect(401);
      await attempt().expect(401);
      await attempt().expect(401);
      await attempt().expect(429);
    } finally {
      await limited.close();
      void limitedPrisma;
    }
  });
});
