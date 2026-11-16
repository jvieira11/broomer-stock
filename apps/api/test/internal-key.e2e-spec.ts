import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDatabase, signUp, TEST_PASSWORD } from './utils';

const KEY = 'chave-interna-de-teste-0123456789';

describe('Chave interna entre o site e a API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });
  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  const login = (
    headers: Record<string, string> = {},
    email = 'x@teste.com',
  ) => {
    let req = request(app.getHttpServer()).post('/api/auth/login');
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
    return req.send({ email, password: 'qualquer-coisa' });
  };

  it('sem a variável, a API continua aberta (nada muda)', async () => {
    await login().expect(401); // chega ao login e erra a senha
  });

  it('com a variável, recusa chamadas sem a chave ou com chave errada', async () => {
    process.env.INTERNAL_API_KEY = KEY;
    await login().expect(403);
    await login({ 'x-internal-key': 'errada' }).expect(403);
    await request(app.getHttpServer()).get('/api/auth/me').expect(403);
  });

  it('com a chave certa, a chamada segue o fluxo normal', async () => {
    process.env.INTERNAL_API_KEY = KEY;
    await login({ 'x-internal-key': KEY }).expect(401); // senha errada, mas passou
    const admin = await signUp(app);
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('x-internal-key', KEY)
      .send({ email: admin.email, password: TEST_PASSWORD })
      .expect(201);
    expect((res.body as { token: string }).token).toBeTruthy();
  });

  it('as rotas de saúde ficam abertas para monitores', async () => {
    process.env.INTERNAL_API_KEY = KEY;
    await request(app.getHttpServer()).get('/api/health').expect(200);
    await request(app.getHttpServer()).get('/api/health/live').expect(200);
  });
});

describe('Limite de tentativas por IP do usuário (e2e)', () => {
  let limited: INestApplication<App>;

  beforeAll(async () => {
    const previous = process.env.AUTH_RATE_LIMIT;
    process.env.AUTH_RATE_LIMIT = '3';
    ({ app: limited } = await createTestApp());
    process.env.AUTH_RATE_LIMIT = previous;
  });
  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });
  afterAll(async () => {
    await limited.close();
  });

  const attempt = (headers: Record<string, string>) => {
    let req = request(limited.getHttpServer()).post('/api/auth/login');
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
    return req.send({ email: 'y@teste.com', password: 'qualquer-coisa' });
  };

  it('com a chave certa, cada usuário (X-Client-IP) tem a própria cota', async () => {
    process.env.INTERNAL_API_KEY = KEY;
    const a = { 'x-internal-key': KEY, 'x-client-ip': '203.0.113.10' };
    const b = { 'x-internal-key': KEY, 'x-client-ip': '203.0.113.11' };
    await attempt(a).expect(401);
    await attempt(a).expect(401);
    await attempt(a).expect(401);
    await attempt(a).expect(429);
    // Outro usuário não é afetado pelo bloqueio do primeiro.
    await attempt(b).expect(401);
  });

  it('sem a chave ligada, X-Client-IP é ignorado: trocar de IP não burla o limite', async () => {
    const ip = (n: number) => ({ 'x-client-ip': `198.51.100.${n}` });
    await attempt(ip(1)).expect(401);
    await attempt(ip(2)).expect(401);
    await attempt(ip(3)).expect(401);
    await attempt(ip(4)).expect(429);
  });
});
