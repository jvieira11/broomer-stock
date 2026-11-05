import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createProduct,
  createTestApp,
  MISSING_ID,
  operate,
  resetDatabase,
  signUp,
  TestProduct,
  userWithRole,
} from './utils';

interface OperationBody {
  id: string;
  number: number;
  type: string;
  user: { id: string };
  movements: {
    variantId: string;
    quantity: number;
    balanceBefore: number;
    balanceAfter: number;
    unitCost: string;
    userId: string;
  }[];
}

describe('Operações de estoque (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof signUp>>;
  let camisa: TestProduct;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    admin = await signUp(app);
    camisa = await createProduct(admin.api, {
      variants: [
        { size: 'P', color: 'PRETO' },
        { size: 'M', color: 'PRETO' },
        { size: 'M', color: 'BRANCO' },
      ],
    });
    // A API devolve as variações ordenadas por cor e tamanho; aqui ficam na
    // ordem das constantes abaixo.
    const pick = (size: string, color: string) =>
      camisa.variants.find((v) => v.size === size && v.color === color)!;
    camisa.variants = [
      pick('P', 'PRETO'),
      pick('M', 'PRETO'),
      pick('M', 'BRANCO'),
    ];
  });

  afterAll(async () => {
    await app.close();
  });

  const [P_PRETO, M_PRETO, M_BRANCO] = [0, 1, 2];
  const variantId = (index: number) => camisa.variants[index].id;
  const balance = async (index: number) =>
    (
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId(index) },
      })
    ).quantity;
  const enter = (index: number, quantity: number, unitCost?: number) =>
    operate(admin.api, 'ENTRY', [
      { variantId: variantId(index), quantity, unitCost },
    ]).expect(201);

  it('entrada aumenta o saldo só da variação e registra saldo antes/depois e autor', async () => {
    const res = await operate(
      admin.api,
      'ENTRY',
      [{ variantId: variantId(M_PRETO), quantity: 8, unitCost: 40 }],
      { origin: 'Fornecedor X', notes: 'NF 123' },
    ).expect(201);

    const body = res.body as OperationBody;
    expect(body).toMatchObject({
      type: 'ENTRY',
      origin: 'Fornecedor X',
      user: { id: admin.userId },
    });
    expect(body.number).toBeGreaterThan(0);
    expect(body.movements).toEqual([
      expect.objectContaining({
        quantity: 8,
        balanceBefore: 0,
        balanceAfter: 8,
        unitCost: '40',
        userId: admin.userId,
      }),
    ]);
    expect(await balance(M_PRETO)).toBe(8);
    expect(await balance(P_PRETO)).toBe(0);
    expect(await balance(M_BRANCO)).toBe(0);
  });

  it('venda com várias peças baixa cada SKU e fica numa única operação', async () => {
    await operate(admin.api, 'ENTRY', [
      { variantId: variantId(P_PRETO), quantity: 4 },
      { variantId: variantId(M_PRETO), quantity: 8 },
      { variantId: variantId(M_BRANCO), quantity: 6 },
    ]).expect(201);

    const res = await operate(
      admin.api,
      'SALE',
      [
        { variantId: variantId(M_PRETO), quantity: 2 },
        { variantId: variantId(M_BRANCO), quantity: 1 },
      ],
      { saleReference: 'CUPOM-981' },
    ).expect(201);

    const sale = res.body as OperationBody;
    expect(sale).toMatchObject({ type: 'SALE', saleReference: 'CUPOM-981' });
    expect(sale.movements.map((m) => m.quantity).sort((x, y) => x - y)).toEqual(
      [-2, -1],
    );
    expect(await balance(P_PRETO)).toBe(4);
    expect(await balance(M_PRETO)).toBe(6);
    expect(await balance(M_BRANCO)).toBe(5);

    const detail = await admin.api
      .get(`/api/operations/${sale.id}`)
      .expect(200);
    expect((detail.body as OperationBody).movements).toHaveLength(2);
  });

  it('bloqueia venda maior que o saldo e não grava nada da operação', async () => {
    await enter(M_PRETO, 3);
    await enter(M_BRANCO, 5);

    // O segundo item falha: o primeiro também não pode ser gravado.
    const res = await operate(admin.api, 'SALE', [
      { variantId: variantId(M_BRANCO), quantity: 2 },
      { variantId: variantId(M_PRETO), quantity: 4 },
    ]).expect(400);
    expect((res.body as { message: string }).message).toContain(
      'Estoque insuficiente: disponível 3, solicitado 4',
    );

    expect(await balance(M_PRETO)).toBe(3);
    expect(await balance(M_BRANCO)).toBe(5);
    expect(await prisma.stockOperation.count({ where: { type: 'SALE' } })).toBe(
      0,
    );
    expect(await prisma.stockMovement.count()).toBe(2);
  });

  it('vendas simultâneas do mesmo SKU nunca deixam o saldo negativo', async () => {
    await enter(M_PRETO, 5);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        operate(admin.api, 'SALE', [
          { variantId: variantId(M_PRETO), quantity: 1 },
        ]),
      ),
    );

    expect(results.map((r) => r.status).sort()).toEqual([
      201, 201, 201, 201, 201, 400, 400, 400,
    ]);
    expect(await balance(M_PRETO)).toBe(0);
    // Cada saída registrou o saldo de partida certo (sem leituras sobrepostas).
    const outs = await prisma.stockMovement.findMany({
      where: { variantId: variantId(M_PRETO), quantity: { lt: 0 } },
      orderBy: { balanceBefore: 'desc' },
    });
    expect(outs.map((m) => m.balanceBefore)).toEqual([5, 4, 3, 2, 1]);
  });

  it('numera as operações em sequência, sem buracos de vendas recusadas', async () => {
    await enter(M_PRETO, 3);
    await operate(admin.api, 'SALE', [
      { variantId: variantId(M_PRETO), quantity: 9 },
    ]).expect(400);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        operate(admin.api, 'SALE', [
          { variantId: variantId(M_PRETO), quantity: 1 },
        ]),
      ),
    );
    await enter(M_BRANCO, 1);

    const numbers = (
      await prisma.stockOperation.findMany({
        select: { number: true },
        orderBy: { number: 'asc' },
      })
    ).map((o) => o.number);
    // Entrada + 3 vendas aceitas (3 recusadas por falta de saldo) + entrada.
    expect(numbers).toHaveLength(5);
    expect(numbers).toEqual(numbers.map((_, i) => numbers[0] + i));
  });

  it('vendas cruzadas simultâneas não travam (sem deadlock)', async () => {
    await operate(admin.api, 'ENTRY', [
      { variantId: variantId(M_PRETO), quantity: 10 },
      { variantId: variantId(M_BRANCO), quantity: 10 },
    ]).expect(201);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        operate(
          admin.api,
          'SALE',
          i % 2
            ? [
                { variantId: variantId(M_PRETO), quantity: 1 },
                { variantId: variantId(M_BRANCO), quantity: 1 },
              ]
            : [
                { variantId: variantId(M_BRANCO), quantity: 1 },
                { variantId: variantId(M_PRETO), quantity: 1 },
              ],
        ),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await balance(M_PRETO)).toBe(4);
    expect(await balance(M_BRANCO)).toBe(4);
  });

  it('reenvio com a mesma chave não duplica a operação', async () => {
    await enter(M_PRETO, 5);
    const body = {
      idempotencyKey: 'chave-de-teste-123',
      saleReference: 'V-1',
    };
    const sale = () =>
      operate(
        admin.api,
        'SALE',
        [{ variantId: variantId(M_PRETO), quantity: 2 }],
        body,
      );

    const [first, second] = await Promise.all([sale(), sale()]);
    const third = await sale();
    expect([first.status, second.status, third.status]).toEqual([
      201, 201, 201,
    ]);
    const ids = [first, second, third].map(
      (r) => (r.body as { id: string }).id,
    );
    expect(new Set(ids).size).toBe(1);
    expect(await balance(M_PRETO)).toBe(3);
  });

  it('calcula o custo médio por variação', async () => {
    await enter(M_PRETO, 10, 5);
    await enter(M_PRETO, 10, 7);
    const variant = () =>
      prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId(M_PRETO) },
      });
    // (10 x 5 + 10 x 7) / 20 = 6
    expect((await variant()).averageCost.toString()).toBe('6');

    const sale = await operate(admin.api, 'SALE', [
      { variantId: variantId(M_PRETO), quantity: 15 },
    ]).expect(201);
    expect((sale.body as OperationBody).movements[0].unitCost).toBe('6');
    expect((await variant()).averageCost.toString()).toBe('6');
  });

  it('ajuste de inventário define o saldo pela contagem e exige motivo', async () => {
    await enter(P_PRETO, 10);
    const count = (quantity: number, reason?: string) =>
      operate(
        admin.api,
        'INVENTORY',
        [{ variantId: variantId(P_PRETO), quantity }],
        {
          reason,
        },
      );

    await count(7).expect(400);
    const res = await count(7, 'Contagem de outubro').expect(201);
    expect((res.body as OperationBody).movements[0]).toMatchObject({
      quantity: -3,
      balanceBefore: 10,
      balanceAfter: 7,
    });
    await count(7, 'Sem diferença').expect(400);
    expect(await balance(P_PRETO)).toBe(7);
  });

  it('perda e devoluções usam tipos próprios, não viram venda', async () => {
    await enter(M_BRANCO, 5);
    await operate(
      admin.api,
      'LOSS',
      [{ variantId: variantId(M_BRANCO), quantity: 1 }],
      {
        reason: 'Peça manchada',
      },
    ).expect(201);
    await operate(
      admin.api,
      'CUSTOMER_RETURN',
      [{ variantId: variantId(M_BRANCO), quantity: 1 }],
      { reason: 'Troca de tamanho' },
    ).expect(201);

    const sales = await admin.api.get('/api/operations?type=SALE').expect(200);
    expect((sales.body as { total: number }).total).toBe(0);
    expect(await balance(M_BRANCO)).toBe(5);
  });

  it('estorno desfaz a venda, preserva a original e não pode repetir', async () => {
    await enter(M_PRETO, 5, 10);
    const sale = (
      await operate(admin.api, 'SALE', [
        { variantId: variantId(M_PRETO), quantity: 2 },
      ]).expect(201)
    ).body as OperationBody;
    expect(await balance(M_PRETO)).toBe(3);

    await admin.api.post(`/api/operations/${sale.id}/reverse`, {}).expect(400);
    const reversal = await admin.api
      .post(`/api/operations/${sale.id}/reverse`, {
        reason: 'Venda lançada em dobro',
      })
      .expect(201);
    expect(reversal.body).toMatchObject({
      type: 'REVERSAL',
      reason: 'Venda lançada em dobro',
      reversedOperation: { id: sale.id },
    });
    expect(await balance(M_PRETO)).toBe(5);

    // A venda original continua no histórico, marcada como estornada.
    const original = await admin.api
      .get(`/api/operations/${sale.id}`)
      .expect(200);
    expect(original.body).toMatchObject({
      type: 'SALE',
      reversal: { id: (reversal.body as { id: string }).id },
    });
    await admin.api
      .post(`/api/operations/${sale.id}/reverse`, { reason: 'De novo' })
      .expect(409);
    await admin.api
      .post(`/api/operations/${(reversal.body as { id: string }).id}/reverse`, {
        reason: 'Estorno do estorno',
      })
      .expect(400);
  });

  it('estorno de entrada é recusado se as peças já saíram', async () => {
    const entry = (await enter(M_PRETO, 2)).body as OperationBody;
    await operate(admin.api, 'SALE', [
      { variantId: variantId(M_PRETO), quantity: 2 },
    ]).expect(201);

    await admin.api
      .post(`/api/operations/${entry.id}/reverse`, { reason: 'Nota errada' })
      .expect(400);
    expect(await balance(M_PRETO)).toBe(0);
  });

  it('recusa dados inválidos', async () => {
    await enter(M_PRETO, 5);
    const item = (quantity: number) => [
      { variantId: variantId(M_PRETO), quantity },
    ];

    await operate(admin.api, 'SALE', [
      { variantId: MISSING_ID, quantity: 1 },
    ]).expect(404);
    await operate(admin.api, 'SALE', item(0)).expect(400);
    await operate(admin.api, 'SALE', item(-1)).expect(400);
    await operate(admin.api, 'SALE', item(1.5)).expect(400);
    await operate(admin.api, 'SALE', []).expect(400);
    await operate(admin.api, 'XYZ', item(1)).expect(400);
    // Estorno e carga inicial não são registrados por aqui.
    await operate(admin.api, 'REVERSAL', item(1)).expect(400);
    await operate(admin.api, 'INITIAL_LOAD', item(1)).expect(400);
    // Custo só em entradas; mesma variação duas vezes; data no futuro.
    await operate(admin.api, 'SALE', [
      { variantId: variantId(M_PRETO), quantity: 1, unitCost: 2 },
    ]).expect(400);
    await operate(admin.api, 'SALE', [...item(1), ...item(1)]).expect(400);
    await operate(admin.api, 'SALE', item(1), {
      occurredAt: new Date(Date.now() + 86_400_000).toISOString(),
    }).expect(400);
    expect(await balance(M_PRETO)).toBe(5);
  });

  it('recusa valores fora do limite e texto inválido com 400, nunca 500', async () => {
    const one = (extra: Record<string, unknown> = {}) => [
      { variantId: variantId(M_PRETO), quantity: 1, ...extra },
    ];
    // Quantidade e custo acima do limite (o banco guarda só 32 bits).
    for (const quantity of [1_000_001, 2_147_483_648, 1e10]) {
      const res = await operate(admin.api, 'ENTRY', one({ quantity })).expect(
        400,
      );
      expect(JSON.stringify(res.body)).not.toMatch(/Prisma|P20\d\d/);
    }
    for (const unitCost of [null, 1_000_001, 1e11, 1e20]) {
      await operate(admin.api, 'ENTRY', one({ unitCost })).expect(400);
    }
    // Texto com caractere nulo, na operação e na busca.
    await operate(admin.api, 'LOSS', one(), { reason: 'a\u0000b' }).expect(400);
    await admin.api.get('/api/variants?search=a%00b').expect(400);
    // JSON com níveis demais.
    let deep: object = {};
    for (let i = 0; i < 5000; i++) deep = { a: deep };
    await admin.api.post('/api/operations', deep).expect(400);
    expect(await balance(M_PRETO)).toBe(0);
    // Os limites exatos continuam valendo.
    await operate(
      admin.api,
      'ENTRY',
      one({ quantity: 1_000_000, unitCost: 1_000_000 }),
    ).expect(201);
    expect(await balance(M_PRETO)).toBe(1_000_000);
  });

  it('desativar o produto bloqueia movimentações e preserva o histórico', async () => {
    await enter(M_PRETO, 5);
    await admin.api
      .patch(`/api/products/${camisa.id}`, { active: false })
      .expect(200);

    await operate(admin.api, 'SALE', [
      { variantId: variantId(M_PRETO), quantity: 1 },
    ]).expect(400);
    await admin.api.delete(`/api/products/${camisa.id}`).expect(409);

    const history = await admin.api
      .get(`/api/movements?variantId=${variantId(M_PRETO)}`)
      .expect(200);
    expect((history.body as { total: number }).total).toBe(1);
    const product = await admin.api
      .get(`/api/products/${camisa.id}`)
      .expect(200);
    expect(product.body).toMatchObject({ active: false });
  });

  it('histórico filtra por tipo, tamanho, cor, período e usuário', async () => {
    const operator = await userWithRole(
      app,
      admin.organizationId,
      Role.OPERATOR,
    );
    await enter(M_PRETO, 5);
    await enter(M_BRANCO, 5);
    await operate(operator.api, 'SALE', [
      { variantId: variantId(M_BRANCO), quantity: 1 },
    ]).expect(201);

    const total = async (query: string) =>
      (
        (await admin.api.get(`/api/movements?${query}`).expect(200)).body as {
          total: number;
        }
      ).total;

    expect(await total('')).toBe(3);
    expect(await total('type=SALE')).toBe(1);
    expect(await total('color=BRANCO')).toBe(2);
    expect(await total('size=P')).toBe(0);
    expect(await total(`userId=${operator.user.id}`)).toBe(1);
    expect(await total(`productId=${camisa.id}&color=PRETO`)).toBe(1);
    expect(await total('from=2000-01-01&to=2000-01-31')).toBe(0);
    await admin.api.get('/api/movements?from=31-01-2000').expect(400);
    await admin.api.get('/api/movements?pageSize=0').expect(400);
  });
});
