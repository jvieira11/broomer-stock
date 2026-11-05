// Enriquece a demonstração online com dados FICTÍCIOS para o módulo de Compras
// (nunca use em produção). Roda DEPOIS de seed.mjs, na mesma base:
//   DEMO_API_URL=https://SUA-API.onrender.com/api DEMO_PASSWORD='a senha do admin' \
//     node deploy/demo/seed-compras.mjs
// Cria: histórico de 85 dias em alguns SKUs (para as sugestões), pedidos de
// compra em vários status (rascunho, pendente, enviado com recebimento parcial,
// recebido e cancelado) e importa o relatório de vendas fictício de 12 meses.
// Não repete: se já houver pedidos de compra, não faz nada.
import { randomUUID as uuid } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const API = (process.env.DEMO_API_URL || 'http://localhost:3333/api').replace(/\/$/, '');
const PASS = process.env.DEMO_PASSWORD;
const EMAIL = process.env.DEMO_ADMIN_EMAIL || 'demo@broomer.local';
if (!PASS || PASS.length < 12) { console.error('Defina DEMO_PASSWORD (mínimo 12 caracteres).'); process.exit(1); }

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const log = (...a) => console.log('•', ...a);

(async () => {
  const token = (await call('POST', '/auth/login', null, { email: EMAIL, password: PASS })).token;
  const existing = await call('GET', '/purchase-orders?pageSize=1', token);
  if (existing.total > 0) { console.log('A demonstração de compras já foi carregada. Nada a fazer.'); return; }

  // Variações por SKU.
  const bySku = new Map();
  for (let page = 1; ; page++) {
    const res = await call('GET', `/variants?pageSize=200&page=${page}`, token);
    for (const v of res.items) bySku.set(v.sku, v);
    if (bySku.size >= res.total || res.items.length === 0) break;
  }
  const v = (sku) => { const x = bySku.get(sku); if (!x) throw new Error(`SKU ${sku} não encontrado na demonstração`); return x; };

  // 1) Histórico de ~85 dias: entrada antiga + vendas espalhadas (2 peças por venda).
  const history = [
    ['0002326-M-BRANCO', 40], ['0002326-G-AZULMARINHO', 34], ['0002326-G-BRANCO', 26],
    ['0002410-M-MARINHO', 36], ['0002410-G-CINZA', 22], ['0001150-42-BEGE', 20], ['0004100-42-PRETO', 12],
  ];
  // Retomável: confere o que já existe em cada SKU (entrada e vendas do
  // histórico) e só cria o que falta, para repetir sem duplicar.
  for (const [sku, total] of history) {
    const variant = v(sku);
    const ops = Math.ceil(total / 2);
    const entries = await call('GET', `/movements?variantId=${variant.id}&type=ENTRY&pageSize=200`, token);
    const sales = await call('GET', `/movements?variantId=${variant.id}&type=SALE&pageSize=200`, token);
    const hasEntry = entries.items.some((m) => (m.operation.origin ?? '').includes('histórico fictício'));
    const doneSales = sales.items.filter((m) => (m.operation.saleReference ?? '').startsWith('CUPOM H')).length;
    if (!hasEntry) {
      await call('POST', '/operations', token, {
        type: 'ENTRY', occurredAt: daysAgo(86), idempotencyKey: uuid(),
        items: [{ variantId: variant.id, quantity: ops * 2, unitCost: Number(variant.averageCost) || 60 }],
        origin: 'NF 4390 - histórico fictício',
      });
    }
    for (let i = doneSales; i < ops; i++) {
      await call('POST', '/operations', token, {
        type: 'SALE', occurredAt: daysAgo(Math.round(80 - (i * 76) / Math.max(ops - 1, 1))), idempotencyKey: uuid(),
        items: [{ variantId: variant.id, quantity: 2 }], saleReference: `CUPOM H${Math.floor(Math.random() * 90000 + 10000)}`,
      });
    }
    log(`histórico ${sku}: ${ops * 2} peças vendidas em ~80 dias${hasEntry || doneSales ? ' (retomado)' : ''}`);
  }

  // 2) Pedidos de compra em vários status.
  const suppliers = Object.fromEntries((await call('GET', '/suppliers', token)).map((s) => [s.name, s.id]));
  const textil = suppliers['Têxtil Nordeste'], atlantico = suppliers['Confecções Atlântico'], couros = suppliers['Couros do Sertão'];
  const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  const sug = await call('GET', '/purchases/suggestions?onlyActionable=true&pageSize=8', token);
  if (sug.items.length) {
    await call('POST', '/purchase-orders/from-suggestions', token, {
      idempotencyKey: uuid(),
      items: sug.items.slice(0, 6).map((s) => ({ variantId: s.variantId, quantity: s.suggested })),
    });
    log(`rascunho(s) criado(s) a partir de ${Math.min(6, sug.items.length)} sugestões`);
  }

  await call('POST', '/purchase-orders', token, {
    status: 'PENDING', supplierId: textil, expectedAt: inDays(12), notes: 'Reposição de calças - prazo combinado 12 dias', idempotencyKey: uuid(),
    items: [{ variantId: v('0001150-40-BEGE').id, quantity: 6, unitCost: 115 }, { variantId: v('0001150-44-AZULMARINHO').id, quantity: 4, unitCost: 115 }],
  });

  const sent = await call('POST', '/purchase-orders', token, {
    status: 'PENDING', supplierId: atlantico, expectedAt: inDays(6), notes: 'Bermudas de verão', idempotencyKey: uuid(),
    items: [{ variantId: v('0003015-40-KHAKI').id, quantity: 8, unitCost: 70 }, { variantId: v('0003015-42-KHAKI').id, quantity: 8, unitCost: 70 }],
  });
  await call('POST', `/purchase-orders/${sent.id}/status`, token, { status: 'SENT' });
  await call('POST', `/purchase-orders/${sent.id}/receive`, token, {
    idempotencyKey: uuid(), notes: 'NF 5120 - primeira remessa',
    items: [{ itemId: sent.items[0].id, quantity: 5, unitCost: 70 }, { itemId: sent.items[1].id, quantity: 3, unitCost: 70 }],
  });
  log('pedido enviado com recebimento parcial');

  const done = await call('POST', '/purchase-orders', token, {
    status: 'PENDING', supplierId: couros, notes: 'Sapatos', idempotencyKey: uuid(),
    items: [{ variantId: v('0004100-43-PRETO').id, quantity: 4, unitCost: 190 }],
  });
  await call('POST', `/purchase-orders/${done.id}/status`, token, { status: 'SENT' });
  await call('POST', `/purchase-orders/${done.id}/receive`, token, {
    idempotencyKey: uuid(), notes: 'NF 3391', items: [{ itemId: done.items[0].id, quantity: 4, unitCost: 192 }],
  });

  const cancelled = await call('POST', '/purchase-orders', token, {
    supplierId: couros, notes: 'Cancelado: fornecedor sem estoque', idempotencyKey: uuid(),
    items: [{ variantId: v('0000777').id, quantity: 10, unitCost: 45 }],
  });
  await call('POST', `/purchase-orders/${cancelled.id}/status`, token, { status: 'CANCELLED' });
  log('pedidos recebido e cancelado');

  // 3) Histórico de vendas fictício (12 meses) pelo mesmo importador do sistema.
  try {
    const bytes = await readFile(new URL('./vendas-ficticias.xlsx', import.meta.url));
    const form = () => { const f = new FormData(); f.set('file', new Blob([bytes]), 'vendas-ficticias.xlsx'); return f; };
    const headers = { authorization: `Bearer ${token}` };
    const preview = await (await fetch(`${API}/sales-history/import/preview`, { method: 'POST', headers, body: form() })).json();
    if (!preview.canImport) throw new Error(JSON.stringify(preview.errors ?? preview));
    const f = form(); f.set('fileHash', preview.fileHash);
    const res = await fetch(`${API}/sales-history/import`, { method: 'POST', headers, body: f });
    if (!res.ok) throw new Error(await res.text());
    log(`histórico de vendas importado: ${preview.lineCount} linhas`);
  } catch (e) {
    console.error('Aviso: não importei o histórico de vendas:', e.message);
  }
  console.log('ok');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
