import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  client,
  createTestApp,
  resetDatabase,
  signUp,
  TEST_PASSWORD,
  userWithRole,
  createProduct,
  operate,
} from './utils';

describe('Papéis e usuários (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof signUp>>;
  let variantId: string;
  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    admin = await signUp(app);
    const product = await createProduct(admin.api);
    productId = product.id;
    variantId = product.variants[0].id;
    await operate(admin.api, 'ENTRY', [{ variantId, quantity: 10 }]).expect(
      201,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (role: Role) => userWithRole(app, admin.organizationId, role);

  it('VIEWER só lê', async () => {
    const { api } = await as(Role.VIEWER);

    await api.get('/api/products').expect(200);
    await api.get('/api/dashboard').expect(200);
    await api.post('/api/products', { reference: 'N', name: 'N' }).expect(403);
    await api.post('/api/categories', { name: 'N' }).expect(403);
    await operate(api, 'ENTRY', [{ variantId, quantity: 1 }]).expect(403);
    await api.get('/api/users').expect(403);
  });

  it('OPERATOR registra entradas e vendas, mas não ajusta saldo nem altera cadastros', async () => {
    const { api } = await as(Role.OPERATOR);

    await operate(api, 'ENTRY', [{ variantId, quantity: 1 }]).expect(201);
    const sale = await operate(api, 'SALE', [
      { variantId, quantity: 1 },
    ]).expect(201);
    for (const type of [
      'INVENTORY',
      'LOSS',
      'CUSTOMER_RETURN',
      'SUPPLIER_RETURN',
    ]) {
      await operate(api, type, [{ variantId, quantity: 1 }], {
        reason: 'Teste',
      }).expect(403);
    }
    await api
      .post(`/api/operations/${(sale.body as { id: string }).id}/reverse`, {
        reason: 'Teste',
      })
      .expect(403);
    await api
      .patch(`/api/variants/${variantId}`, { active: false })
      .expect(403);
    await api.post('/api/products', { reference: 'N', name: 'N' }).expect(403);
    await api.patch(`/api/products/${productId}`, { name: 'X' }).expect(403);
    await api.delete(`/api/products/${productId}`).expect(403);
  });

  it('MANAGER cuida de cadastros e movimentações, mas não de usuários', async () => {
    const { api } = await as(Role.MANAGER);

    await api.post('/api/products', { reference: 'N', name: 'N' }).expect(201);
    await api.post('/api/categories', { name: 'C' }).expect(201);
    await operate(api, 'INVENTORY', [{ variantId, quantity: 3 }], {
      reason: 'Contagem',
    }).expect(201);
    await api.get('/api/users').expect(403);
    await api
      .post('/api/users', {
        name: 'X',
        email: 'x@teste.com',
        password: TEST_PASSWORD,
        role: 'ADMIN',
      })
      .expect(403);
  });

  it('ADMIN cria usuários que conseguem entrar com a senha definida', async () => {
    const created = await admin.api
      .post('/api/users', {
        name: 'João',
        email: 'Joao@Teste.com',
        password: TEST_PASSWORD,
        role: 'OPERATOR',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      email: 'joao@teste.com',
      role: 'OPERATOR',
      active: true,
    });
    expect(created.body).not.toHaveProperty('passwordHash');

    await client(app)
      .post('/api/auth/login', {
        email: 'joao@teste.com',
        password: TEST_PASSWORD,
      })
      .expect(201);

    // E-mail é único no sistema inteiro.
    await admin.api
      .post('/api/users', {
        name: 'Outro',
        email: 'joao@teste.com',
        password: TEST_PASSWORD,
        role: 'VIEWER',
      })
      .expect(409);
  });

  it('ADMIN muda papel, senha e desativa; a mudança vale na hora', async () => {
    const operador = await as(Role.OPERATOR);

    await admin.api
      .patch(`/api/users/${operador.user.id}`, { role: 'VIEWER' })
      .expect(200);
    await operate(operador.api, 'ENTRY', [{ variantId, quantity: 1 }]).expect(
      403,
    );

    await admin.api
      .patch(`/api/users/${operador.user.id}`, { password: 'nova-senha-456' })
      .expect(200);
    await client(app)
      .post('/api/auth/login', {
        email: operador.user.email,
        password: 'nova-senha-456',
      })
      .expect(201);

    await admin.api
      .patch(`/api/users/${operador.user.id}`, { active: false })
      .expect(200);
    await operador.api.get('/api/products').expect(401);
  });

  it('a empresa nunca fica sem administrador', async () => {
    // Ninguém muda o próprio papel nem se desativa.
    await admin.api
      .patch(`/api/users/${admin.userId}`, { role: 'VIEWER' })
      .expect(400);
    await admin.api
      .patch(`/api/users/${admin.userId}`, { active: false })
      .expect(400);

    // Com dois administradores, um pode rebaixar o outro. Quem sobra é o
    // único administrador e, como não pode mudar a si mesmo, nunca sai.
    const segundo = await as(Role.ADMIN);
    await segundo.api
      .patch(`/api/users/${admin.userId}`, { role: 'MANAGER' })
      .expect(200);
    await segundo.api
      .patch(`/api/users/${segundo.user.id}`, { role: 'VIEWER' })
      .expect(400);
    // E quem não é administrador não mexe em usuários.
    await admin.api
      .patch(`/api/users/${segundo.user.id}`, { active: false })
      .expect(403);
  });

  it('movimentação guarda quem a fez', async () => {
    const operador = await as(Role.OPERATOR);
    await operate(operador.api, 'SALE', [{ variantId, quantity: 3 }]).expect(
      201,
    );

    const res = await admin.api.get('/api/movements?type=SALE').expect(200);
    expect((res.body as { items: unknown[] }).items).toEqual([
      expect.objectContaining({
        quantity: -3,
        user: { id: operador.user.id, name: operador.user.name },
      }),
    ]);
    const operation = await admin.api
      .get('/api/operations?type=SALE')
      .expect(200);
    expect((operation.body as { items: unknown[] }).items).toEqual([
      expect.objectContaining({
        user: { id: operador.user.id, name: operador.user.name },
      }),
    ]);
  });
});
