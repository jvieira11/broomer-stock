import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createProduct,
  createTestApp,
  operate,
  resetDatabase,
  signUp,
} from './utils';

interface Summary {
  activeProducts: number;
  activeVariants: number;
  totalPieces: number;
  lowStockCount: number;
  outOfStockCount: number;
  entries: number;
  sales: number;
  saleOperations: number;
  otherOutputs: number;
  reversals: number;
  stockCostValue: string;
  stockSaleValue: string;
  daily: { day: string; in: number; out: number }[];
  topProducts: { name: string; sold: number }[];
  lowStock: { sku: string; status: string }[];
  recentOperations: { type: string }[];
}

describe('Painel (e2e)', () => {
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

  const summary = async (query = '') =>
    (await admin.api.get(`/api/dashboard${query}`).expect(200)).body as Summary;

  it('retorna zeros para uma loja nova', async () => {
    expect(await summary()).toMatchObject({
      activeProducts: 0,
      activeVariants: 0,
      totalPieces: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      entries: 0,
      sales: 0,
      stockCostValue: '0.00',
      stockSaleValue: '0.00',
      daily: [],
      topProducts: [],
      lowStock: [],
      recentOperations: [],
    });
  });

  it('distingue modelos, variações e peças; calcula entradas, vendas e alertas', async () => {
    const camisa = await createProduct(admin.api, {
      name: 'Camisa',
      minQuantity: 3,
      variants: [
        { sku: 'C-P', size: 'P' },
        { sku: 'C-M', size: 'M' },
        { sku: 'C-G', size: 'G' },
      ],
    });
    const inativo = await createProduct(admin.api, { name: 'Inativo' });
    await admin.api
      .patch(`/api/products/${camisa.id}`, { salePrice: 100 })
      .expect(200);

    // P: 10 peças a 40 (normal); M: 2 peças a 40 (baixo); G: zerado.
    await operate(admin.api, 'ENTRY', [
      { variantId: camisa.variants[0].id, quantity: 12, unitCost: 40 },
      { variantId: camisa.variants[1].id, quantity: 2, unitCost: 40 },
      { variantId: inativo.variants[0].id, quantity: 5, unitCost: 1000 },
    ]).expect(201);
    const sale = await operate(admin.api, 'SALE', [
      { variantId: camisa.variants[0].id, quantity: 2 },
    ]).expect(201);
    await operate(
      admin.api,
      'LOSS',
      [{ variantId: inativo.variants[0].id, quantity: 1 }],
      { reason: 'Avaria' },
    ).expect(201);
    await admin.api
      .post(`/api/operations/${(sale.body as { id: string }).id}/reverse`, {
        reason: 'Teste',
      })
      .expect(201);
    await operate(admin.api, 'SALE', [
      { variantId: camisa.variants[0].id, quantity: 2 },
    ]).expect(201);
    await admin.api
      .patch(`/api/products/${inativo.id}`, { active: false })
      .expect(200);

    const res = await summary();
    expect(res).toMatchObject({
      activeProducts: 1,
      activeVariants: 3,
      totalPieces: 12,
      lowStockCount: 1,
      outOfStockCount: 1,
      // Entradas e vendas registradas; o estorno aparece à parte.
      entries: 19,
      sales: 4,
      saleOperations: 2,
      otherOutputs: 1,
      reversals: 1,
      // 12 peças x 40 de custo / x 100 de venda; o inativo fica fora.
      stockCostValue: '480.00',
      stockSaleValue: '1200.00',
      topProducts: [{ name: 'Camisa', sold: 4 }],
    });
    expect(res.lowStock.map((v) => `${v.sku}:${v.status}`)).toEqual([
      'C-G:OUT',
      'C-M:LOW',
    ]);
    expect(res.daily).toHaveLength(1);
    expect(res.daily[0]).toMatchObject({ in: 21, out: 5 });
    expect(res.recentOperations).toHaveLength(5);

    // Período sem operações.
    expect(await summary('?from=2000-01-01&to=2000-01-31')).toMatchObject({
      entries: 0,
      sales: 0,
      daily: [],
      totalPieces: 12,
    });
  });

  it('valida o período', async () => {
    await admin.api
      .get('/api/dashboard?from=2026-02-01&to=2026-01-01')
      .expect(400);
    await admin.api
      .get('/api/dashboard?from=2020-01-01&to=2026-01-01')
      .expect(400);
    await admin.api.get('/api/dashboard?from=ontem').expect(400);
  });
});
