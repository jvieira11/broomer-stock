import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as XLSX from 'xlsx';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createProduct,
  createTestApp,
  operate,
  resetDatabase,
  signUp,
  userWithRole,
} from './utils';

type Cell = string | number | null;

// Relatório "vendas por cupom" fictício, no leiaute do ERP.
function salesFile(
  body: Cell[][],
  totals: [number, number],
  period = '01/10/2026 A 31/10/2026',
) {
  const sheet: Cell[][] = [
    ['RELATÓRIO VENDAS POR CUPOM     DATA: 04/11/2026'],
    [`PERÍODO: ${period}          PRAÇA/LOJA(S): 104 - BROOMER`],
    [],
    [
      'DATA',
      'VENDEDOR',
      'PRODUTO',
      'TAMANHO',
      'VALOR UN',
      'QTDE',
      'DESCONTO',
      '% DESCONTO',
      'CUSTO',
      'DEVOLUÇÃO',
      'TOTAL',
    ],
    ...body,
    [
      'TOTAL GERAL',
      null,
      null,
      null,
      null,
      totals[0],
      null,
      null,
      null,
      null,
      totals[1],
    ],
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet), 'Sheet');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const BODY: Cell[][] = [
  ['01/10/2026', 'Ana', 'CAMISA LINHO SLIM', 'M', 200, 2, 20, 5, 120, 0, 380],
  [null, null, 'CAMISA LINHO SLIM', 'G', 200, 1, 0, 0, 60, 0, 200],
  [
    null,
    null,
    'CAMISA LINHO SLIM COMPOSE Total',
    null,
    null,
    3,
    20,
    3,
    180,
    0,
    580,
  ],
  ['02/10/2026', 'Bia', 'POLO PIQUET', 'M', 150, 3, 0, 0, 90, 0, 450],
  [
    '03/10/2026',
    'Bia',
    'DEVOLUÇÃO POLO PIQUET',
    'M',
    150,
    -1,
    -0,
    0,
    -30,
    150,
    -150,
  ],
];
// peças: 2+1+3-1 = 5; total: 380+200+450-150 = 880
const TOTALS: [number, number] = [5, 880];

describe('Histórico de vendas importado (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof signUp>>;
  let token: string;

  const upload = (
    path: string,
    file: Buffer,
    auth = token,
    fields: Record<string, string> = {},
  ) => {
    let req = request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${auth}`)
      .attach('file', file, 'vendas.xlsx');
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req;
  };
  const hashOf = async (file: Buffer) =>
    (
      (await upload('/api/sales-history/import/preview', file)).body as {
        fileHash: string;
      }
    ).fileHash;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    admin = await signUp(app);
    token = admin.token;
  });
  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('a prévia não grava nada e traz os totais conferidos', async () => {
    const res = await upload(
      '/api/sales-history/import/preview',
      salesFile(BODY, TOTALS),
    ).expect(201);
    const body = res.body as {
      canImport: boolean;
      lineCount: number;
      totals: { pieces: number; total: number };
      months: { month: string }[];
    };
    expect(body.canImport).toBe(true);
    expect(body.lineCount).toBe(4);
    expect(body.totals).toMatchObject({ pieces: 5, total: 880 });
    expect(body.months.map((m) => m.month)).toEqual(['2026-10']);
    expect(await prisma.saleLine.count()).toBe(0);
  });

  it('importa sem mexer no estoque e a análise reflete as vendas', async () => {
    const product = await createProduct(admin.api, {
      variants: [{ size: 'M', color: 'PRETO' }],
    });
    await operate(admin.api, 'ENTRY', [
      { variantId: product.variants[0].id, quantity: 7 },
    ]).expect(201);
    const operationsBefore = await prisma.stockOperation.count();

    const file = salesFile(BODY, TOTALS);
    const res = await upload('/api/sales-history/import', file, token, {
      fileHash: await hashOf(file),
    }).expect(201);
    expect(res.body).toMatchObject({ lineCount: 4, pieces: 5, total: 880 });

    // Estoque intacto e nenhuma operação nova.
    expect(await prisma.stockOperation.count()).toBe(operationsBefore);
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: product.variants[0].id },
        })
      ).quantity,
    ).toBe(7);

    const summary = (
      await admin.api.get('/api/sales-history/summary').expect(200)
    ).body as {
      totals: {
        soldPieces: number;
        returnedPieces: number;
        netPieces: number;
        revenue: string;
        discount: string;
      };
      months: { month: string; pieces: number }[];
      categories: { category: string; pieces: number }[];
      sizes: { size: string; pieces: number }[];
      products: { description: string; pieces: number }[];
      sellers: { seller: string; revenue: string }[];
    };
    expect(summary.totals).toMatchObject({
      soldPieces: 6,
      returnedPieces: 1,
      netPieces: 5,
      revenue: '880.00',
    });
    expect(summary.months).toEqual([
      expect.objectContaining({ month: '2026-10', pieces: 5 }),
    ]);
    expect(summary.categories.map((c) => [c.category, c.pieces])).toEqual([
      ['CAMISA', 3],
      ['POLO', 2],
    ]);
    expect(summary.sizes.map((s) => [s.size, s.pieces])).toEqual([
      ['M', 4],
      ['G', 1],
    ]);
    expect(summary.products[0]).toMatchObject({
      description: 'CAMISA LINHO SLIM',
      pieces: 3,
    });
    expect(summary.sellers[0].seller).toBe('Ana');

    // Filtro por categoria.
    const polo = (
      await admin.api
        .get('/api/sales-history/summary?category=polo')
        .expect(200)
    ).body as {
      totals: { netPieces: number };
    };
    expect(polo.totals.netPieces).toBe(2);
  });

  it('recusa o mesmo arquivo, período sobreposto e arquivo alterado', async () => {
    const file = salesFile(BODY, TOTALS);
    const hash = await hashOf(file);
    await upload('/api/sales-history/import', file, token, {
      fileHash: hash,
    }).expect(201);
    // Mesmo arquivo de novo (também pela prévia, que já avisa).
    const preview = (
      await upload('/api/sales-history/import/preview', file).expect(201)
    ).body as {
      canImport: boolean;
      errors: { message: string }[];
    };
    expect(preview.canImport).toBe(false);
    expect(preview.errors[0].message).toContain('já foi importado');
    await upload('/api/sales-history/import', file, token, {
      fileHash: hash,
    }).expect(400);
    // Outro arquivo no mesmo período.
    const other = salesFile([BODY[3]], [3, 450]);
    await upload('/api/sales-history/import', other, token, {
      fileHash: await hashOf(other),
    }).expect(400);
    // Hash que não corresponde ao arquivo enviado.
    const novo = salesFile([BODY[3]], [3, 450], '01/11/2026 A 30/11/2026');
    await upload('/api/sales-history/import', novo, token, {
      fileHash: hash,
    }).expect(400);
    expect(await prisma.salesImport.count()).toBe(1);
  });

  it('recusa relatório cuja soma não bate com o TOTAL GERAL, sem gravar', async () => {
    const bad = salesFile(BODY, [9, 880]);
    const res = await upload('/api/sales-history/import', bad, token, {
      fileHash: await hashOf(bad),
    }).expect(400);
    expect(JSON.stringify(res.body)).toContain('TOTAL GERAL');
    expect(await prisma.saleLine.count()).toBe(0);
  });

  it('remover uma importação apaga só as linhas dela', async () => {
    const a = salesFile(BODY, TOTALS);
    await upload('/api/sales-history/import', a, token, {
      fileHash: await hashOf(a),
    }).expect(201);
    // Outro mês, para o período não se sobrepor.
    const nov = salesFile(
      [['05/11/2026', 'Bia', 'POLO PIQUET', 'M', 150, 3, 0, 0, 90, 0, 450]],
      [3, 450],
      '01/11/2026 A 30/11/2026',
    );
    await upload('/api/sales-history/import', nov, token, {
      fileHash: await hashOf(nov),
    }).expect(201);
    expect(await prisma.saleLine.count()).toBe(5);
    const list = (await admin.api.get('/api/sales-history/imports').expect(200))
      .body as { id: string; lineCount: number }[];
    const outubro = list.find((i) => i.lineCount === 4)!;
    await request(app.getHttpServer())
      .delete(`/api/sales-history/imports/${outubro.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    expect(await prisma.saleLine.count()).toBe(1);
  });

  it('permissões: gerente importa e consulta; só admin remove; operador e consulta não acessam', async () => {
    const manager = await userWithRole(app, admin.organizationId, Role.MANAGER);
    const operator = await userWithRole(
      app,
      admin.organizationId,
      Role.OPERATOR,
    );
    const viewer = await userWithRole(app, admin.organizationId, Role.VIEWER);
    const file = salesFile(BODY, TOTALS);
    await upload(
      '/api/sales-history/import/preview',
      file,
      operator.token,
    ).expect(403);
    await viewer.api.get('/api/sales-history/summary').expect(403);
    await operator.api.get('/api/sales-history/imports').expect(403);
    const res = await upload('/api/sales-history/import', file, manager.token, {
      fileHash: await hashOf(file),
    }).expect(201);
    await manager.api.get('/api/sales-history/summary').expect(200);
    await request(app.getHttpServer())
      .delete(`/api/sales-history/imports/${(res.body as { id: string }).id}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .expect(403);
  });

  it('outra loja não vê as vendas importadas', async () => {
    const file = salesFile(BODY, TOTALS);
    await upload('/api/sales-history/import', file, token, {
      fileHash: await hashOf(file),
    }).expect(201);
    const other = await signUp(app, 'Outra');
    const summary = (
      await other.api.get('/api/sales-history/summary').expect(200)
    ).body as { totals: { lines: number } };
    expect(summary.totals.lines).toBe(0);
    expect(
      (
        (await other.api.get('/api/sales-history/imports').expect(200))
          .body as unknown[]
      ).length,
    ).toBe(0);
  });

  it('sugestão por categoria e tamanho cruza as vendas importadas com o estoque', async () => {
    // Estoque: camisas M (5 peças) e G (40 peças); vendas importadas de camisa
    // M em vários dias (≥ 3 vendas e ≥ 14 dias de histórico).
    const camisa = await createProduct(admin.api, {
      name: 'Camisa Linho',
      variants: [
        { size: 'M', color: 'PRETO' },
        { size: 'G', color: 'PRETO' },
      ],
    });
    const byId = (size: string) =>
      camisa.variants.find((v) => v.size === size)!;
    await operate(admin.api, 'ENTRY', [
      { variantId: byId('M').id, quantity: 5 },
      { variantId: byId('G').id, quantity: 40 },
    ]).expect(201);

    const days = ['01', '08', '15', '22', '29'];
    const body: Cell[][] = days.map((d) => [
      `${d}/10/2026`,
      'Ana',
      'CAMISA LINHO SLIM',
      'M',
      200,
      4,
      0,
      0,
      160,
      0,
      800,
    ]);
    const file = salesFile(body, [20, 4000]);
    await upload('/api/sales-history/import', file, token, {
      fileHash: await hashOf(file),
    }).expect(201);

    const res = (await admin.api.get('/api/purchases/by-size').expect(200))
      .body as {
      hasSales: boolean;
      referenceDate: string;
      items: {
        category: string;
        size: string;
        quantity: number;
        sold: number;
        suggested: number | null;
        classification: string;
        reliable: boolean;
      }[];
    };
    expect(res.hasSales).toBe(true);
    expect(res.referenceDate).toBe('2026-10-29');
    const m = res.items.find((i) => i.category === 'CAMISA' && i.size === 'M')!;
    expect(m).toMatchObject({ quantity: 5, sold: 20, reliable: true });
    // 20 peças em 29 dias (0,69/dia): meta ceil(0,69 x 45) = 32; 32 - 5 = 27.
    expect(m.suggested).toBe(27);
    expect(['CRITICAL', 'REPLENISH']).toContain(m.classification);
    // G tem estoque e nenhuma venda: parado.
    const g = res.items.find((i) => i.category === 'CAMISA' && i.size === 'G')!;
    expect(g).toMatchObject({ quantity: 40, sold: 0 });
    // Só administrador e gerente; filtro por categoria.
    const viewer = await userWithRole(app, admin.organizationId, Role.VIEWER);
    await viewer.api.get('/api/purchases/by-size').expect(403);
    const polo = (
      await admin.api.get('/api/purchases/by-size?category=polo').expect(200)
    ).body as { items: unknown[] };
    expect(polo.items).toEqual([]);
  });

  it('sem vendas importadas, a sugestão por tamanho avisa e não inventa', async () => {
    const res = (await admin.api.get('/api/purchases/by-size').expect(200))
      .body as { hasSales: boolean; items: unknown[] };
    expect(res).toMatchObject({ hasSales: false, items: [] });
  });

  it('recusa arquivo que não é planilha', async () => {
    await upload(
      '/api/sales-history/import/preview',
      Buffer.from('texto'),
    ).expect(400);
  });
});
