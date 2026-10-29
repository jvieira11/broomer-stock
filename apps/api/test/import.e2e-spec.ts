import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { erpReport, ErpRow } from './erp-report';
import {
  createProduct,
  createTestApp,
  resetDatabase,
  signUp,
  userWithRole,
} from './utils';

const ROWS: ErpRow[] = [
  [
    '0002326215021',
    'CAMISA LINHO SLIM',
    'FORN A',
    'P',
    '2024 VERAO',
    'PRETO',
    199.9,
    'SLIM',
    4,
    50,
  ],
  [
    '0002326215724',
    'CAMISA LINHO SLIM',
    'FORN A',
    'M',
    '2024 VERAO',
    'PRETO',
    199.9,
    'SLIM',
    0,
    50,
  ],
  [
    '0003033215137',
    'CALCA SOCIAL',
    'forn a',
    '40',
    'BASIC',
    'SALMON',
    299.9,
    'COMFORT',
    2,
    80,
  ],
  [
    '0001386001001',
    'COLAR COURO',
    'FORN B',
    'DV',
    'BASIC',
    '-',
    89.9,
    '-',
    -1,
    27,
  ],
];

describe('Importação do estoque do ERP (e2e)', () => {
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

  const upload = (
    path: string,
    token: string,
    file: Buffer,
    fields: Record<string, string> = {},
  ) => {
    let req = request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, 'estoque final do dia.xls');
    for (const [key, value] of Object.entries(fields))
      req = req.field(key, value);
    return req;
  };

  it('prévia não grava nada e mostra totais, padronizações e avisos', async () => {
    const res = await upload(
      '/api/products/import/preview',
      admin.token,
      erpReport(ROWS),
    ).expect(201);
    expect(res.body).toMatchObject({
      reportDate: '2024-11-09',
      canImport: true,
      totals: {
        models: 3,
        variants: 4,
        pieces: 6,
        negative: 1,
        zero: 1,
        suppliers: 3,
      },
      errorCount: 0,
      warningCount: 1,
    });
    expect(
      (res.body as { categories: { name: string }[] }).categories
        .map((c) => c.name)
        .sort(),
    ).toEqual(['Calça', 'Camisa', 'Colar']);
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.stockOperation.count()).toBe(0);
  });

  it('confirmação cria modelos, SKUs, categorias e a carga inicial rastreável', async () => {
    const file = erpReport(ROWS);
    const preview = await upload(
      '/api/products/import/preview',
      admin.token,
      file,
    ).expect(201);
    const fileHash = (preview.body as { fileHash: string }).fileHash;

    const res = await upload('/api/products/import', admin.token, file, {
      fileHash,
    }).expect(201);
    expect(res.body).toMatchObject({
      products: 3,
      variants: 4,
      pieces: 6,
      categoriesCreated: 3,
    });

    const camisaP = await prisma.productVariant.findUniqueOrThrow({
      where: {
        organizationId_sku: {
          organizationId: admin.organizationId,
          sku: '0002326215021',
        },
      },
      include: { product: { include: { category: true, supplier: true } } },
    });
    expect(camisaP).toMatchObject({
      size: 'P',
      color: 'PRETO',
      quantity: 4,
      product: {
        reference: '0002326',
        collection: '2024 VERÃO',
        category: { name: 'Camisa' },
        supplier: { name: 'FORN A' },
      },
    });
    expect(camisaP.averageCost.toString()).toBe('50');
    // "forn a" reaproveita o fornecedor "FORN A"; SALMON vira SALMAO.
    expect(await prisma.supplier.count()).toBe(2);
    const calca = await prisma.productVariant.findFirstOrThrow({
      where: { sku: '0003033215137' },
    });
    expect(calca.color).toBe('SALMAO');
    // Negativo entra como 0, sem movimentação.
    const colar = await prisma.productVariant.findFirstOrThrow({
      where: { sku: '0001386001001' },
    });
    expect(colar).toMatchObject({ quantity: 0, size: '', color: '' });

    const operation = await prisma.stockOperation.findFirstOrThrow({
      include: { movements: true },
    });
    expect(operation).toMatchObject({
      type: 'INITIAL_LOAD',
      userId: admin.userId,
    });
    expect(operation.occurredAt.toISOString()).toBe('2024-11-10T02:59:59.000Z');
    expect(operation.movements.map((m) => m.quantity).sort()).toEqual([2, 4]);
    expect(operation.movements.every((m) => m.balanceBefore === 0)).toBe(true);

    // O mesmo arquivo de novo: tudo já existe, nada é gravado.
    await upload('/api/products/import', admin.token, file, {
      fileHash,
    }).expect(400);
    expect(await prisma.productVariant.count()).toBe(4);
  });

  it('recusa confirmar com arquivo diferente da prévia ou com conflitos', async () => {
    const preview = await upload(
      '/api/products/import/preview',
      admin.token,
      erpReport(ROWS),
    ).expect(201);
    const fileHash = (preview.body as { fileHash: string }).fileHash;
    await upload(
      '/api/products/import',
      admin.token,
      erpReport(ROWS.slice(1)),
      { fileHash },
    ).expect(400);

    await createProduct(admin.api, {
      reference: '0002326',
      variants: [{ sku: 'X1' }],
    });
    const conflict = await upload(
      '/api/products/import/preview',
      admin.token,
      erpReport(ROWS),
    ).expect(201);
    expect(conflict.body).toMatchObject({ canImport: false, errorCount: 1 });
    await upload('/api/products/import', admin.token, erpReport(ROWS), {
      fileHash,
    }).expect(400);
    expect(await prisma.stockOperation.count()).toBe(0);
  });

  it('valida o arquivo e a permissão', async () => {
    await upload(
      '/api/products/import/preview',
      admin.token,
      Buffer.from('lixo'),
    ).expect(400);
    const manager = await userWithRole(app, admin.organizationId, Role.MANAGER);
    await upload(
      '/api/products/import/preview',
      manager.token,
      erpReport(ROWS),
    ).expect(403);
    await request(app.getHttpServer())
      .post('/api/products/import/preview')
      .expect(401);
  });
});
