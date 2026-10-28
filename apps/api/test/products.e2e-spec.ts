import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createProduct,
  createTestApp,
  MISSING_ID,
  operate,
  resetDatabase,
  signUp,
} from './utils';

interface ProductBody {
  id: string;
  reference: string;
  salePrice: string;
  minQuantity: number;
  active: boolean;
  category: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  variants: {
    id: string;
    sku: string;
    size: string;
    color: string;
    quantity: number;
    status: string;
  }[];
}

interface PageBody<T> {
  items: T[];
  total: number;
}

describe('Produtos e variações (e2e)', () => {
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

  it('cadastra modelo com variações por tamanho e cor, saldo zero e fornecedor', async () => {
    const category = await admin.api
      .post('/api/categories', { name: 'Camisas' })
      .expect(201);

    const res = await admin.api
      .post('/api/products', {
        reference: '0002326',
        name: 'Camisa ML linho slim',
        categoryId: (category.body as { id: string }).id,
        supplierName: 'Fornecedor Teste',
        collection: '2024 VERAO',
        fit: 'SLIM',
        salePrice: 299.9,
        minQuantity: 2,
        variants: [
          { sku: '0002326215021', size: ' p ', color: 'preto' },
          { sku: '0002326215724', size: 'M', color: 'Preto' },
          { sku: '0002326223736', size: 'G', color: 'azul  marinho' },
        ],
      })
      .expect(201);

    const body = res.body as ProductBody;
    expect(body).toMatchObject({
      reference: '0002326',
      salePrice: '299.9',
      minQuantity: 2,
      active: true,
      category: { name: 'Camisas' },
      supplier: { name: 'Fornecedor Teste' },
    });
    // Zeros à esquerda preservados; tamanho e cor normalizados.
    expect(
      body.variants.map(
        (v) => `${v.sku} ${v.size}/${v.color} ${v.quantity} ${v.status}`,
      ),
    ).toEqual([
      '0002326223736 G/AZUL MARINHO 0 OUT',
      '0002326215021 P/PRETO 0 OUT',
      '0002326215724 M/PRETO 0 OUT',
    ]);

    // O mesmo fornecedor é reaproveitado, sem diferenciar maiúsculas.
    await admin.api
      .post('/api/products', {
        reference: '0003033',
        name: 'Calça',
        supplierName: 'fornecedor teste',
      })
      .expect(201);
    expect(await prisma.supplier.count()).toBe(1);
  });

  it('impede SKU, referência e combinação de tamanho/cor duplicados', async () => {
    const product = await createProduct(admin.api, {
      reference: '0001',
      variants: [{ sku: '111', size: 'M', color: 'PRETO' }],
    });

    // SKU repetido no mesmo envio e em outro produto.
    await admin.api
      .post('/api/products', {
        reference: '0002',
        name: 'X',
        variants: [
          { sku: '222', size: 'P' },
          { sku: '222', size: 'M' },
        ],
      })
      .expect(400);
    await admin.api
      .post('/api/products', {
        reference: '0002',
        name: 'X',
        variants: [{ sku: '111', size: 'P' }],
      })
      .expect(409);
    // Referência repetida.
    await admin.api
      .post('/api/products', { reference: '0001', name: 'Outro' })
      .expect(409);
    // Mesma combinação no mesmo modelo, inclusive com grafia diferente.
    await admin.api
      .post(`/api/products/${product.id}/variants`, {
        sku: '333',
        size: 'm',
        color: ' preto ',
      })
      .expect(409);
    // Sem tamanho e sem cor (acessório) só uma vez.
    await admin.api
      .post(`/api/products/${product.id}/variants`, { sku: '444' })
      .expect(201);
    await admin.api
      .post(`/api/products/${product.id}/variants`, { sku: '555' })
      .expect(409);
    expect(await prisma.productVariant.count()).toBe(2);
  });

  it('não aceita saldo nem custo no cadastro ou na edição', async () => {
    await admin.api
      .post('/api/products', {
        reference: '1',
        name: 'X',
        variants: [{ sku: '1', quantity: 5 }],
      })
      .expect(400);
    const product = await createProduct(admin.api);
    await admin.api
      .patch(`/api/variants/${product.variants[0].id}`, { quantity: 10 })
      .expect(400);
    await admin.api
      .patch(`/api/variants/${product.variants[0].id}`, { averageCost: 1 })
      .expect(400);
  });

  it('valida campos obrigatórios, números e ids', async () => {
    await admin.api
      .post('/api/products', { name: 'Sem referência' })
      .expect(400);
    await admin.api.post('/api/products', { reference: '1' }).expect(400);
    await admin.api
      .post('/api/products', { reference: '1', name: 'X', salePrice: -1 })
      .expect(400);
    await admin.api
      .post('/api/products', { reference: '1', name: 'X', minQuantity: 1.5 })
      .expect(400);
    await admin.api
      .post('/api/products', {
        reference: '1',
        name: 'X',
        categoryId: MISSING_ID,
      })
      .expect(400);
    await admin.api
      .post('/api/products', {
        reference: '1',
        name: 'X',
        variants: [{ sku: 'com espaço' }],
      })
      .expect(400);
    await admin.api.get('/api/products/abc').expect(400);
    await admin.api.get(`/api/products/${MISSING_ID}`).expect(404);
  });

  it('variação pode ter mínimo e preço próprios; null volta ao do modelo', async () => {
    const product = await createProduct(admin.api, { minQuantity: 5 });
    const [variant] = product.variants;
    await operate(admin.api, 'ENTRY', [
      { variantId: variant.id, quantity: 3 },
    ]).expect(201);

    const status = async () =>
      (
        (await admin.api.get(`/api/products/${product.id}`).expect(200))
          .body as ProductBody
      ).variants[0].status;

    expect(await status()).toBe('LOW');
    await admin.api
      .patch(`/api/variants/${variant.id}`, { minQuantity: 2 })
      .expect(200);
    expect(await status()).toBe('NORMAL');
    await admin.api
      .patch(`/api/variants/${variant.id}`, { minQuantity: null })
      .expect(200);
    expect(await status()).toBe('LOW');
  });

  it('consulta de estoque filtra por busca, cor, tamanho, categoria e situação', async () => {
    const category = (
      await admin.api.post('/api/categories', { name: 'Polos' }).expect(201)
    ).body as { id: string };
    const polo = await createProduct(admin.api, {
      reference: '0557',
      name: 'Polo piquet',
      categoryId: category.id,
      minQuantity: 3,
      variants: [
        { sku: '0557000027', size: 'P', color: 'AZUL' },
        { sku: '0557000028', size: 'M', color: 'AZUL' },
        { sku: '0557000029', size: 'M', color: 'BRANCO' },
      ],
    });
    await createProduct(admin.api, { name: 'Cinto couro', variants: [{}] });
    await operate(admin.api, 'ENTRY', [
      { variantId: polo.variants[0].id, quantity: 10 },
      { variantId: polo.variants[1].id, quantity: 2 },
    ]).expect(201);

    const list = async (query: string) =>
      (await admin.api.get(`/api/variants?${query}`).expect(200))
        .body as PageBody<{
        sku: string;
        status: string;
      }>;

    expect((await list('')).total).toBe(4);
    expect((await list('search=piquet')).total).toBe(3);
    expect((await list('search=0557000028')).items[0]).toMatchObject({
      sku: '0557000028',
      status: 'LOW',
    });
    expect((await list('color=azul')).total).toBe(2);
    expect((await list('size=M')).total).toBe(2);
    expect((await list(`categoryId=${category.id}`)).total).toBe(3);
    expect((await list('status=OUT')).total).toBe(2);
    expect((await list('status=LOW')).total).toBe(1);
    expect((await list('status=NORMAL')).items.map((i) => i.sku)).toEqual([
      '0557000027',
    ]);
    expect((await list('sort=quantity')).items[0].status).toBe('OUT');
    const page = await list('pageSize=1&page=2');
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(4);
    expect((await list('pageSize=1&page=99')).total).toBe(4);

    const attributes = await admin.api
      .get('/api/variants/attributes')
      .expect(200);
    expect(attributes.body).toEqual({
      sizes: ['P', 'M'],
      colors: ['AZUL', 'BRANCO'],
    });
  });

  it('lista modelos com totais e busca por SKU', async () => {
    const product = await createProduct(admin.api, {
      name: 'Bermuda sarja',
      variants: [
        { sku: 'BER-38', size: '38' },
        { sku: 'BER-40', size: '40' },
      ],
    });
    await operate(admin.api, 'ENTRY', [
      { variantId: product.variants[0].id, quantity: 4 },
      { variantId: product.variants[1].id, quantity: 1 },
    ]).expect(201);

    const res = await admin.api.get('/api/products?search=BER-40').expect(200);
    expect(res.body).toMatchObject({
      total: 1,
      items: [{ name: 'Bermuda sarja', variantCount: 2, totalQuantity: 5 }],
    });
  });

  it('exclui produto sem movimentações; com histórico, só desativa', async () => {
    const novo = await createProduct(admin.api);
    await admin.api.delete(`/api/products/${novo.id}`).expect(204);
    expect(await prisma.productVariant.count()).toBe(0);

    const usado = await createProduct(admin.api);
    await operate(admin.api, 'ENTRY', [
      { variantId: usado.variants[0].id, quantity: 1 },
    ]).expect(201);
    await admin.api.delete(`/api/products/${usado.id}`).expect(409);
    await admin.api.delete(`/api/variants/${usado.variants[0].id}`).expect(409);
    await admin.api
      .patch(`/api/variants/${usado.variants[0].id}`, { active: false })
      .expect(200);
    // Variação inativa sai da consulta padrão, mas o histórico continua.
    expect(
      (
        (await admin.api.get('/api/variants').expect(200))
          .body as PageBody<unknown>
      ).total,
    ).toBe(0);
    expect(
      (
        (await admin.api.get('/api/variants?active=false').expect(200))
          .body as PageBody<unknown>
      ).total,
    ).toBe(1);
    expect(await prisma.stockMovement.count()).toBe(1);
  });

  it('não usa categoria desativada', async () => {
    const category = (
      await admin.api.post('/api/categories', { name: 'Antiga' }).expect(201)
    ).body as { id: string };
    await admin.api
      .patch(`/api/categories/${category.id}`, { active: false })
      .expect(200);
    await admin.api
      .post('/api/products', {
        reference: '1',
        name: 'X',
        categoryId: category.id,
      })
      .expect(400);
  });
});
