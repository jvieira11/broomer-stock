import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

type Api = Awaited<ReturnType<typeof signUp>>['api'];

interface OrderBody {
  id: string;
  number: number;
  status: string;
  supplier: { id: string; name: string } | null;
  items: {
    id: string;
    variantId: string;
    quantityOrdered: number;
    quantityReceived: number;
  }[];
  receipts: { id: string; number: number }[];
}

interface SuggestionBody {
  variantId: string;
  classification: string;
  suggested: number | null;
  minShortfall: number | null;
  reliable: boolean;
  onOrder: number;
  reason: string;
}

describe('Compras e reposição (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof signUp>>;
  let camisa: TestProduct;

  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString();

  const stockOf = async (variantId: string) =>
    (
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
      })
    ).quantity;

  // Entrada há `since` dias e vendas espalhadas (cada uma de `each` peças).
  async function history(
    api: Api,
    variantId: string,
    entry: number,
    sales: number,
    each: number,
    since = 80,
  ) {
    await operate(
      api,
      'ENTRY',
      [{ variantId, quantity: entry, unitCost: 20 }],
      {
        occurredAt: daysAgo(since),
      },
    ).expect(201);
    for (let i = 0; i < sales; i++) {
      await operate(api, 'SALE', [{ variantId, quantity: each }], {
        occurredAt: daysAgo(70 - i * 8),
      }).expect(201);
    }
  }

  const suggestionsFor = async (api: Api, query = '') => {
    const res = await api
      .get(`/api/purchases/suggestions?${query}`)
      .expect(200);
    return res.body as {
      items: SuggestionBody[];
      counts: Record<string, number>;
      totalSuggested: number;
    };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    admin = await signUp(app);
    camisa = await createProduct(admin.api, {
      name: 'Camisa Linho',
      supplierName: 'Têxtil Nordeste',
      variants: [
        { size: 'P', color: 'PRETO' },
        { size: 'M', color: 'PRETO' },
        { size: 'M', color: 'BRANCO' },
      ],
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  const variant = (size: string, color: string) =>
    camisa.variants.find((v) => v.size === size && v.color === color)!;

  async function supplierId(name = 'Têxtil Nordeste') {
    const res = await admin.api.get('/api/suppliers').expect(200);
    return (res.body as { id: string; name: string }[]).find(
      (s) => s.name === name,
    )!.id;
  }

  async function newOrder(
    items: { variantId: string; quantity: number; unitCost?: number }[],
    extra: Record<string, unknown> = {},
  ) {
    const res = await admin.api
      .post('/api/purchase-orders', {
        supplierId: await supplierId(),
        items,
        ...extra,
      })
      .expect(201);
    return res.body as OrderBody;
  }

  const receive = (
    api: Api,
    order: OrderBody,
    lines: { variantId: string; quantity: number; unitCost?: number }[],
    key = randomUUID(),
  ) =>
    api.post(`/api/purchase-orders/${order.id}/receive`, {
      idempotencyKey: key,
      items: lines.map((l) => ({
        itemId: order.items.find((i) => i.variantId === l.variantId)!.id,
        quantity: l.quantity,
        unitCost: l.unitCost,
      })),
    });

  describe('sugestões', () => {
    it('sugere reposição pela meta de prazo + cobertura e explica o motivo', async () => {
      const pm = variant('M', 'PRETO');
      // 40 entradas, 6 vendas de 5 = 30 em ~80 dias -> estoque 10.
      await history(admin.api, pm.id, 40, 6, 5);
      const { items } = await suggestionsFor(admin.api);
      const row = items.find((i) => i.variantId === pm.id)!;
      expect(row.reliable).toBe(true);
      expect(row.classification).toBe('REPLENISH');
      // ritmo 30/80 = 0,375; meta ceil(0,375 x 45) = 17; 17 - 10 = 7.
      expect(row.suggested).toBe(7);
      expect(row.reason).toContain('Sugestão: 7 peças');
    });

    it('marca como crítico o que zerou e vende', async () => {
      const pm = variant('M', 'PRETO');
      await history(admin.api, pm.id, 30, 6, 5);
      const { items } = await suggestionsFor(admin.api);
      const row = items.find((i) => i.variantId === pm.id)!;
      expect(row.classification).toBe('CRITICAL');
      expect(row.suggested).toBe(17);
    });

    it('não inventa quantidade sem histórico: informa o déficit do mínimo', async () => {
      const prod = await createProduct(admin.api, {
        minQuantity: 5,
        variants: [{ size: 'G', color: 'AZUL' }],
      });
      await operate(admin.api, 'ENTRY', [
        { variantId: prod.variants[0].id, quantity: 2 },
      ]).expect(201);
      const { items } = await suggestionsFor(admin.api);
      const row = items.find((i) => i.variantId === prod.variants[0].id)!;
      expect(row.reliable).toBe(false);
      expect(row.classification).toBe('BELOW_MIN');
      expect(row.suggested).toBeNull();
      expect(row.minShortfall).toBe(3);
    });

    it('identifica produto parado e excesso de estoque', async () => {
      const pp = variant('P', 'PRETO');
      const mb = variant('M', 'BRANCO');
      await operate(admin.api, 'ENTRY', [{ variantId: pp.id, quantity: 8 }], {
        occurredAt: daysAgo(80),
      }).expect(201);
      await history(admin.api, mb.id, 200, 4, 2);
      const { items } = await suggestionsFor(admin.api);
      expect(items.find((i) => i.variantId === pp.id)!.classification).toBe(
        'STALE',
      );
      expect(items.find((i) => i.variantId === mb.id)!.classification).toBe(
        'EXCESS',
      );
    });

    it('vendas estornadas não contam para o giro', async () => {
      const pm = variant('M', 'PRETO');
      await history(admin.api, pm.id, 40, 6, 5);
      const before = (await suggestionsFor(admin.api)).items.find(
        (i) => i.variantId === pm.id,
      )!;
      const sale = await operate(admin.api, 'SALE', [
        { variantId: pm.id, quantity: 4 },
      ]).expect(201);
      await admin.api
        .post(`/api/operations/${(sale.body as { id: string }).id}/reverse`, {
          reason: 'Cliente desistiu',
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      const after = (await suggestionsFor(admin.api)).items.find(
        (i) => i.variantId === pm.id,
      )!;
      expect(after.suggested).toBe(before.suggested);
    });

    it('filtra por fornecedor, categoria e produto, e pagina', async () => {
      const outro = await createProduct(admin.api, {
        name: 'Bermuda',
        supplierName: 'Confecções Atlântico',
      });
      const sup = await supplierId();
      const bySupplier = await suggestionsFor(admin.api, `supplierId=${sup}`);
      expect(bySupplier.items.length).toBe(3);
      const byProduct = await suggestionsFor(
        admin.api,
        `productId=${outro.id}`,
      );
      expect(byProduct.items.length).toBe(1);
      const paged = await suggestionsFor(admin.api, 'pageSize=2&page=2');
      expect(paged.items.length).toBe(2);
    });

    it('pedidos abertos entram como "a caminho" e reduzem a sugestão', async () => {
      const pm = variant('M', 'PRETO');
      await history(admin.api, pm.id, 40, 6, 5);
      const order = await newOrder([{ variantId: pm.id, quantity: 7 }], {
        status: 'PENDING',
      });
      const row = (await suggestionsFor(admin.api)).items.find(
        (i) => i.variantId === pm.id,
      )!;
      expect(row.onOrder).toBe(7);
      expect(row.suggested).toBe(0);
      // Cancelado, volta a sugerir.
      await admin.api
        .post(`/api/purchase-orders/${order.id}/status`, {
          status: 'CANCELLED',
        })
        .expect(201);
      const again = (await suggestionsFor(admin.api)).items.find(
        (i) => i.variantId === pm.id,
      )!;
      expect(again.suggested).toBe(7);
    });

    it('parâmetros configuráveis mudam o cálculo; só admin e gerente alteram', async () => {
      const pm = variant('M', 'PRETO');
      await history(admin.api, pm.id, 40, 6, 5);
      const settings = {
        analysisDays: 90,
        leadTimeDays: 30,
        coverDays: 60,
        minSales: 3,
        minHistoryDays: 14,
        excessDays: 180,
      };
      await admin.api.put('/api/purchases/settings', settings).expect(200);
      const row = (await suggestionsFor(admin.api)).items.find(
        (i) => i.variantId === pm.id,
      )!;
      // 0,375 x 90 = 34 (arredondado para cima) - 10 = 24
      expect(row.suggested).toBe(24);
      await admin.api
        .put('/api/purchases/settings', { ...settings, coverDays: 0 })
        .expect(400);
      const viewer = await userWithRole(app, admin.organizationId, Role.VIEWER);
      await viewer.api.put('/api/purchases/settings', settings).expect(403);
      await viewer.api.get('/api/purchases/suggestions').expect(200);
    });
  });

  describe('pedidos', () => {
    it('criar e editar pedido não altera o estoque', async () => {
      const pm = variant('M', 'PRETO');
      const order = await newOrder([{ variantId: pm.id, quantity: 10 }]);
      expect(order.status).toBe('DRAFT');
      expect(await stockOf(pm.id)).toBe(0);
      await admin.api
        .patch(`/api/purchase-orders/${order.id}`, {
          items: [{ variantId: pm.id, quantity: 12 }],
          notes: 'urgente',
        })
        .expect(200);
      expect(await stockOf(pm.id)).toBe(0);
      expect(await prisma.stockMovement.count()).toBe(0);
    });

    it('numera os pedidos em sequência e é idempotente no reenvio', async () => {
      const pm = variant('M', 'PRETO');
      const key = randomUUID();
      const a = await newOrder([{ variantId: pm.id, quantity: 1 }], {
        idempotencyKey: key,
      });
      const again = await newOrder([{ variantId: pm.id, quantity: 1 }], {
        idempotencyKey: key,
      });
      const b = await newOrder([{ variantId: pm.id, quantity: 1 }]);
      expect(again.id).toBe(a.id);
      expect(b.number).toBe(a.number + 1);
      expect(await prisma.purchaseOrder.count()).toBe(2);
    });

    it('valida itens, quantidades, duplicatas e fornecedor', async () => {
      const pm = variant('M', 'PRETO');
      await admin.api.post('/api/purchase-orders', { items: [] }).expect(400);
      await admin.api
        .post('/api/purchase-orders', {
          items: [{ variantId: pm.id, quantity: 0 }],
        })
        .expect(400);
      await admin.api
        .post('/api/purchase-orders', {
          items: [
            { variantId: pm.id, quantity: 1 },
            { variantId: pm.id, quantity: 2 },
          ],
        })
        .expect(400);
      await admin.api
        .post('/api/purchase-orders', {
          items: [{ variantId: MISSING_ID, quantity: 1 }],
        })
        .expect(404);
      // Pendente exige fornecedor.
      await admin.api
        .post('/api/purchase-orders', {
          status: 'PENDING',
          items: [{ variantId: pm.id, quantity: 1 }],
        })
        .expect(400);
    });

    it('cria rascunhos por fornecedor a partir das sugestões', async () => {
      const outro = await createProduct(admin.api, {
        name: 'Bermuda',
        supplierName: 'Confecções Atlântico',
      });
      const pm = variant('M', 'PRETO');
      const res = await admin.api
        .post('/api/purchase-orders/from-suggestions', {
          idempotencyKey: randomUUID(),
          items: [
            { variantId: pm.id, quantity: 5 },
            { variantId: variant('P', 'PRETO').id, quantity: 3 },
            { variantId: outro.variants[0].id, quantity: 2 },
          ],
        })
        .expect(201);
      const orders = res.body as OrderBody[];
      expect(orders).toHaveLength(2);
      expect(orders.map((o) => o.status)).toEqual(['DRAFT', 'DRAFT']);
      expect(orders.map((o) => o.items.length).sort()).toEqual([1, 2]);
      expect(await stockOf(pm.id)).toBe(0);
    });

    it('segue o fluxo de status e bloqueia edição depois de enviado', async () => {
      const pm = variant('M', 'PRETO');
      const order = await newOrder([{ variantId: pm.id, quantity: 4 }]);
      const set = (status: string) =>
        admin.api.post(`/api/purchase-orders/${order.id}/status`, { status });
      await set('SENT').expect(409); // rascunho não pula etapa
      await set('PENDING').expect(201);
      await admin.api
        .patch(`/api/purchase-orders/${order.id}`, { notes: 'ok' })
        .expect(200);
      await set('SENT').expect(201);
      await admin.api
        .patch(`/api/purchase-orders/${order.id}`, { notes: 'tarde' })
        .expect(409);
      await set('CANCELLED').expect(201);
      await set('PENDING').expect(409);
    });

    it('cancela pedido sem recebimento; com recebimento, não', async () => {
      const pm = variant('M', 'PRETO');
      const order = await newOrder([{ variantId: pm.id, quantity: 4 }], {
        status: 'PENDING',
      });
      await receive(admin.api, order, [
        { variantId: pm.id, quantity: 1 },
      ]).expect(201);
      await admin.api
        .post(`/api/purchase-orders/${order.id}/status`, {
          status: 'CANCELLED',
        })
        .expect(409);
    });
  });

  describe('recebimento', () => {
    it('recebimento parcial e total geram entradas e atualizam o saldo por tamanho e cor', async () => {
      const pm = variant('M', 'PRETO');
      const pp = variant('P', 'PRETO');
      const mb = variant('M', 'BRANCO');
      const order = await newOrder(
        [
          { variantId: pm.id, quantity: 10, unitCost: 30 },
          { variantId: pp.id, quantity: 6, unitCost: 30 },
          { variantId: mb.id, quantity: 4, unitCost: 32 },
        ],
        { status: 'PENDING' },
      );
      expect(order.status).toBe('PENDING');

      // Parcial: 4 de M/PRETO e 6 de P/PRETO.
      const first = await receive(admin.api, order, [
        { variantId: pm.id, quantity: 4 },
        { variantId: pp.id, quantity: 6 },
      ]).expect(201);
      const partial = first.body as OrderBody;
      expect(partial.status).toBe('PARTIALLY_RECEIVED');
      expect(await stockOf(pm.id)).toBe(4);
      expect(await stockOf(pp.id)).toBe(6);
      expect(await stockOf(mb.id)).toBe(0);

      // A entrada fica ligada ao pedido, com origem rastreável.
      const op = await prisma.stockOperation.findFirstOrThrow({
        where: { purchaseOrderId: order.id },
        include: { movements: true },
      });
      expect(op.type).toBe('ENTRY');
      expect(op.origin).toContain(`Pedido de compra #${order.number}`);
      expect(op.movements).toHaveLength(2);
      expect(
        Number(op.movements.find((m) => m.variantId === pm.id)!.unitCost),
      ).toBe(30);

      // Mais que o pendente é recusado e não grava nada.
      await receive(admin.api, order, [
        { variantId: pm.id, quantity: 7 },
      ]).expect(400);
      expect(await stockOf(pm.id)).toBe(4);

      // Total: o que faltava.
      const last = await receive(admin.api, order, [
        { variantId: pm.id, quantity: 6 },
        { variantId: mb.id, quantity: 4 },
      ]).expect(201);
      expect((last.body as OrderBody).status).toBe('RECEIVED');
      expect(await stockOf(pm.id)).toBe(10);
      expect(await stockOf(mb.id)).toBe(4);
      expect((last.body as OrderBody).receipts).toHaveLength(2);
      // Recebido não recebe de novo.
      await receive(admin.api, order, [
        { variantId: pm.id, quantity: 1 },
      ]).expect(409);
    });

    it('rascunho não recebe mercadoria', async () => {
      const pm = variant('M', 'PRETO');
      const order = await newOrder([{ variantId: pm.id, quantity: 4 }]);
      await receive(admin.api, order, [
        { variantId: pm.id, quantity: 1 },
      ]).expect(409);
      expect(await stockOf(pm.id)).toBe(0);
    });

    it('o mesmo envio repetido não recebe duas vezes (inclusive simultâneo)', async () => {
      const pm = variant('M', 'PRETO');
      const order = await newOrder([{ variantId: pm.id, quantity: 10 }], {
        status: 'PENDING',
      });
      const key = randomUUID();
      const results = await Promise.all([
        receive(admin.api, order, [{ variantId: pm.id, quantity: 3 }], key),
        receive(admin.api, order, [{ variantId: pm.id, quantity: 3 }], key),
        receive(admin.api, order, [{ variantId: pm.id, quantity: 3 }], key),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(await stockOf(pm.id)).toBe(3);
      expect(
        await prisma.stockOperation.count({
          where: { purchaseOrderId: order.id },
        }),
      ).toBe(1);
      // A mesma chave em outro pedido não vale.
      const other = await newOrder([{ variantId: pm.id, quantity: 5 }], {
        status: 'PENDING',
      });
      await receive(
        admin.api,
        other,
        [{ variantId: pm.id, quantity: 1 }],
        key,
      ).expect(409);
    });

    it('recebimentos simultâneos diferentes nunca passam do pedido', async () => {
      const pm = variant('M', 'PRETO');
      const order = await newOrder([{ variantId: pm.id, quantity: 5 }], {
        status: 'PENDING',
      });
      const results = await Promise.all(
        [0, 1, 2, 3].map(() =>
          receive(admin.api, order, [{ variantId: pm.id, quantity: 3 }]),
        ),
      );
      const ok = results.filter((r) => r.status === 201).length;
      expect(ok).toBe(1);
      expect(await stockOf(pm.id)).toBe(3);
    });

    it('estornar o recebimento devolve o pedido ao estado anterior', async () => {
      const pm = variant('M', 'PRETO');
      const order = await newOrder([{ variantId: pm.id, quantity: 5 }], {
        status: 'PENDING',
      });
      const done = await receive(admin.api, order, [
        { variantId: pm.id, quantity: 5 },
      ]).expect(201);
      expect((done.body as OrderBody).status).toBe('RECEIVED');
      const op = await prisma.stockOperation.findFirstOrThrow({
        where: { purchaseOrderId: order.id },
      });
      await admin.api
        .post(`/api/operations/${op.id}/reverse`, {
          reason: 'Entrada lançada errada',
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      expect(await stockOf(pm.id)).toBe(0);
      const after = (
        await admin.api.get(`/api/purchase-orders/${order.id}`).expect(200)
      ).body as OrderBody;
      expect(after.status).toBe('PENDING');
      expect(after.items[0].quantityReceived).toBe(0);
      // E o pedido pode ser recebido de novo.
      await receive(admin.api, order, [
        { variantId: pm.id, quantity: 5 },
      ]).expect(201);
      expect(await stockOf(pm.id)).toBe(5);
    });

    it('o custo do recebimento alimenta o custo médio', async () => {
      const pm = variant('M', 'PRETO');
      await operate(admin.api, 'ENTRY', [
        { variantId: pm.id, quantity: 10, unitCost: 10 },
      ]).expect(201);
      const order = await newOrder(
        [{ variantId: pm.id, quantity: 10, unitCost: 20 }],
        { status: 'PENDING' },
      );
      await receive(admin.api, order, [
        { variantId: pm.id, quantity: 10 },
      ]).expect(201);
      const v = await prisma.productVariant.findUniqueOrThrow({
        where: { id: pm.id },
      });
      expect(v.quantity).toBe(20);
      expect(Number(v.averageCost)).toBe(15);
    });
  });

  describe('permissões e isolamento', () => {
    it('operador recebe, mas não cria nem cancela; consulta só lê', async () => {
      const pm = variant('M', 'PRETO');
      const order = await newOrder([{ variantId: pm.id, quantity: 5 }], {
        status: 'PENDING',
      });
      const operator = await userWithRole(
        app,
        admin.organizationId,
        Role.OPERATOR,
      );
      const viewer = await userWithRole(app, admin.organizationId, Role.VIEWER);
      await operator.api
        .post('/api/purchase-orders', {
          items: [{ variantId: pm.id, quantity: 1 }],
        })
        .expect(403);
      await operator.api
        .post(`/api/purchase-orders/${order.id}/status`, {
          status: 'CANCELLED',
        })
        .expect(403);
      await receive(viewer.api, order, [
        { variantId: pm.id, quantity: 1 },
      ]).expect(403);
      await viewer.api.get(`/api/purchase-orders/${order.id}`).expect(200);
      await receive(operator.api, order, [
        { variantId: pm.id, quantity: 2 },
      ]).expect(201);
      expect(await stockOf(pm.id)).toBe(2);
    });

    it('outra loja não vê nem mexe nos pedidos', async () => {
      const pm = variant('M', 'PRETO');
      const order = await newOrder([{ variantId: pm.id, quantity: 5 }], {
        status: 'PENDING',
      });
      const other = await signUp(app, 'Outra');
      await other.api.get(`/api/purchase-orders/${order.id}`).expect(404);
      await receive(other.api, order, [
        { variantId: pm.id, quantity: 1 },
      ]).expect(404);
      const list = await other.api.get('/api/purchase-orders').expect(200);
      expect((list.body as { total: number }).total).toBe(0);
      await other.api
        .post('/api/purchase-orders', {
          items: [{ variantId: pm.id, quantity: 1 }],
        })
        .expect(404);
      expect(await stockOf(pm.id)).toBe(0);
    });
  });

  describe('dashboard', () => {
    it('reflete reposição, pedidos em aberto e entradas recentes', async () => {
      const pm = variant('M', 'PRETO');
      const pp = variant('P', 'PRETO');
      await history(admin.api, pm.id, 30, 6, 5); // crítico (sugere 17)
      await operate(admin.api, 'ENTRY', [{ variantId: pp.id, quantity: 8 }], {
        occurredAt: daysAgo(80),
      }).expect(201); // parado
      const order = await newOrder([{ variantId: pm.id, quantity: 5 }], {
        status: 'PENDING',
      });
      await receive(admin.api, order, [
        { variantId: pm.id, quantity: 2 },
      ]).expect(201);

      const res = await admin.api.get('/api/purchases/summary').expect(200);
      const body = res.body as {
        counts: Record<string, number>;
        totalSuggested: number;
        needReplenish: number;
        awaitingPieces: number;
        ordersByStatus: Record<string, number>;
        openOrders: { piecesPending: number }[];
        recentEntries: {
          purchaseOrder: { number: number } | null;
          pieces: number;
        }[];
        topNeed: { name: string; suggested: number }[];
        topStale: { pieces: number }[];
      };
      // 17 de meta - 2 em estoque - 3 ainda a caminho = 12.
      expect(body.counts.CRITICAL + body.counts.REPLENISH).toBe(1);
      expect(body.needReplenish).toBe(1);
      expect(body.totalSuggested).toBe(12);
      expect(body.awaitingPieces).toBe(3);
      expect(body.ordersByStatus.PARTIALLY_RECEIVED).toBe(1);
      expect(body.openOrders[0].piecesPending).toBe(3);
      expect(body.recentEntries[0].purchaseOrder?.number).toBe(order.number);
      expect(body.topNeed[0].suggested).toBe(12);
      expect(body.counts.STALE).toBe(1);
      expect(body.topStale[0].pieces).toBe(8);
    });
  });
});
