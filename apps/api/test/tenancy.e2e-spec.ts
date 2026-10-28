import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createProduct,
  createTestApp,
  operate,
  resetDatabase,
  signUp,
  TestProduct,
} from './utils';

// A Broomer usa uma loja só, mas todo dado pertence a uma organização e a
// API filtra por ela. Estes testes garantem que esse isolamento não vaze.
describe('Isolamento entre organizações (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let lojaA: Awaited<ReturnType<typeof signUp>>;
  let lojaB: Awaited<ReturnType<typeof signUp>>;
  let categoriaA: string;
  let produtoA: TestProduct;
  let operacaoA: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    lojaA = await signUp(app, 'Loja A');
    lojaB = await signUp(app, 'Loja B');

    categoriaA = (
      (await lojaA.api.post('/api/categories', { name: 'Camisas' }).expect(201))
        .body as { id: string }
    ).id;
    produtoA = await createProduct(lojaA.api, {
      reference: '0001',
      name: 'Camisa A',
      categoryId: categoriaA,
      variants: [{ sku: '111', size: 'M', color: 'PRETO' }],
    });
    operacaoA = (
      (
        await operate(lojaA.api, 'ENTRY', [
          { variantId: produtoA.variants[0].id, quantity: 10 },
        ]).expect(201)
      ).body as { id: string }
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const balanceA = async () =>
    (
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: produtoA.variants[0].id },
      })
    ).quantity;

  it('listas da outra loja vêm vazias', async () => {
    for (const path of [
      '/api/products',
      '/api/variants',
      '/api/operations',
      '/api/movements',
      `/api/movements?variantId=${produtoA.variants[0].id}`,
    ]) {
      const res = await lojaB.api.get(path).expect(200);
      expect(res.body).toMatchObject({ items: [], total: 0 });
    }
    expect((await lojaB.api.get('/api/categories').expect(200)).body).toEqual(
      [],
    );
    expect((await lojaB.api.get('/api/suppliers').expect(200)).body).toEqual(
      [],
    );
    expect(
      (await lojaB.api.get('/api/variants/attributes').expect(200)).body,
    ).toEqual({ sizes: [], colors: [] });

    const dashboard = await lojaB.api.get('/api/dashboard').expect(200);
    expect(dashboard.body).toMatchObject({
      activeProducts: 0,
      totalPieces: 0,
      entries: 0,
      recentOperations: [],
    });
  });

  it('registros da outra loja respondem 404, inclusive para alterar', async () => {
    const variantA = produtoA.variants[0].id;
    await lojaB.api.get(`/api/products/${produtoA.id}`).expect(404);
    await lojaB.api
      .patch(`/api/products/${produtoA.id}`, { name: 'Invadido' })
      .expect(404);
    await lojaB.api.delete(`/api/products/${produtoA.id}`).expect(404);
    await lojaB.api
      .post(`/api/products/${produtoA.id}/variants`, { sku: '999' })
      .expect(404);
    await lojaB.api
      .patch(`/api/variants/${variantA}`, { active: false })
      .expect(404);
    await lojaB.api.delete(`/api/variants/${variantA}`).expect(404);
    await lojaB.api.get(`/api/operations/${operacaoA}`).expect(404);
    await lojaB.api
      .post(`/api/operations/${operacaoA}/reverse`, { reason: 'Invasão' })
      .expect(404);

    await lojaB.api.get(`/api/categories/${categoriaA}`).expect(404);
    await lojaB.api
      .patch(`/api/categories/${categoriaA}`, { name: 'Invadida' })
      .expect(404);
    await lojaB.api.delete(`/api/categories/${categoriaA}`).expect(404);

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: produtoA.id },
    });
    expect(product.name).toBe('Camisa A');
    expect(await balanceA()).toBe(10);
  });

  it('não movimenta variação da outra loja', async () => {
    await operate(lojaB.api, 'SALE', [
      { variantId: produtoA.variants[0].id, quantity: 10 },
    ]).expect(404);
    expect(await balanceA()).toBe(10);
  });

  it('não usa categoria da outra loja', async () => {
    await lojaB.api
      .post('/api/products', {
        reference: 'X',
        name: 'X',
        categoryId: categoriaA,
      })
      .expect(400);
    const produtoB = await createProduct(lojaB.api);
    await lojaB.api
      .patch(`/api/products/${produtoB.id}`, { categoryId: categoriaA })
      .expect(400);
  });

  it('referência, SKU e categoria podem se repetir entre lojas', async () => {
    await lojaB.api.post('/api/categories', { name: 'Camisas' }).expect(201);
    await createProduct(lojaB.api, {
      reference: '0001',
      variants: [{ sku: '111', size: 'M', color: 'PRETO' }],
    });
  });

  it('cada loja só enxerga os próprios usuários', async () => {
    const res = await lojaB.api.get('/api/users').expect(200);
    expect(res.body).toEqual([expect.objectContaining({ id: lojaB.userId })]);
  });
});
