import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, MISSING_ID, resetDatabase, signUp } from './utils';

describe('Categorias (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    admin = await signUp(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria, lista, busca, atualiza e remove uma categoria', async () => {
    const created = await admin.api
      .post('/api/categories', {
        name: 'Bebidas',
        description: 'Refrigerantes e sucos',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Bebidas',
      organizationId: admin.organizationId,
    });
    const { id } = created.body as { id: string };

    const list = await admin.api.get('/api/categories').expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ id, _count: { products: 0 } }),
    ]);

    await admin.api.get(`/api/categories/${id}`).expect(200);

    const updated = await admin.api
      .patch(`/api/categories/${id}`, { name: 'Bebidas geladas' })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Bebidas geladas' });

    await admin.api.delete(`/api/categories/${id}`).expect(204);
    await admin.api.get(`/api/categories/${id}`).expect(404);
  });

  it('rejeita nome vazio e campos desconhecidos', async () => {
    await admin.api.post('/api/categories', { name: '' }).expect(400);
    await admin.api
      .post('/api/categories', { name: 'Limpeza', foo: 'bar' })
      .expect(400);
  });

  it('retorna 409 para nome duplicado na mesma empresa', async () => {
    await admin.api.post('/api/categories', { name: 'Limpeza' }).expect(201);
    const res = await admin.api
      .post('/api/categories', { name: 'Limpeza' })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'P2002' });
  });

  it('retorna 404 para id inexistente e 400 para id inválido', async () => {
    await admin.api.get(`/api/categories/${MISSING_ID}`).expect(404);
    await admin.api
      .patch(`/api/categories/${MISSING_ID}`, { name: 'X' })
      .expect(404);
    await admin.api.delete(`/api/categories/${MISSING_ID}`).expect(404);
    await admin.api.get('/api/categories/nao-e-uuid').expect(400);
  });

  it('categoria com produtos não é excluída: é desativada e continua nos produtos', async () => {
    const category = await admin.api
      .post('/api/categories', { name: 'Camisas' })
      .expect(201);
    const categoryId = (category.body as { id: string }).id;
    const product = await admin.api
      .post('/api/products', { reference: '0001', name: 'Camisa', categoryId })
      .expect(201);

    await admin.api.delete(`/api/categories/${categoryId}`).expect(409);
    await admin.api
      .patch(`/api/categories/${categoryId}`, { active: false })
      .expect(200);

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: (product.body as { id: string }).id },
    });
    expect(after.categoryId).toBe(categoryId);
    const active = await admin.api
      .get('/api/categories?active=true')
      .expect(200);
    expect(active.body).toEqual([]);
    const search = await admin.api
      .get('/api/categories?search=cami')
      .expect(200);
    expect(search.body).toEqual([
      expect.objectContaining({
        id: categoryId,
        active: false,
        _count: { products: 1 },
      }),
    ]);
  });
});
