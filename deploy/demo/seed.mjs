// Carga de dados FICTÍCIOS para a demonstração online (nunca use em produção).
// Cria equipe, categorias, produtos e ~20 operações dos últimos dias.
// Uso (Node 20+):
//   DEMO_API_URL=https://SUA-API.onrender.com/api DEMO_PASSWORD='a senha do admin' \
//     node deploy/demo/seed.mjs
// O administrador (DEMO_ADMIN_EMAIL, padrão demo@broomer.local) precisa existir
// (o render.yaml o cria na subida). Roda uma vez: repetir falha por duplicidade.
import { randomUUID as uuid } from 'node:crypto';
const API = (process.env.DEMO_API_URL || 'http://localhost:3333/api').replace(/\/$/, '');
const PASS = process.env.DEMO_PASSWORD;
if (!PASS || PASS.length < 12) { console.error('Defina DEMO_PASSWORD (mínimo 12 caracteres).'); process.exit(1); }
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || 'demo@broomer.local';

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
const login = async (email) => (await call('POST', '/auth/login', null, { email, password: PASS })).token;

// Data relativa a hoje, no horário de Maceió (UTC-3).
function when(daysAgo, hour, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour + 3, minute, 0, 0);
  return d.toISOString();
}

(async () => {
  const admin = await login(ADMIN_EMAIL);

  // Equipe (nomes fictícios), um perfil de cada.
  for (const u of [
    ['Marina Costa', 'marina@broomer.local', 'MANAGER'],
    ['Rafael Lima', 'rafael@broomer.local', 'OPERATOR'],
    ['Juliana Alves', 'juliana@broomer.local', 'VIEWER'],
  ]) await call('POST', '/users', admin, { name: u[0], email: u[1], password: PASS, role: u[2] });
  const manager = await login('marina@broomer.local');
  const operator = await login('rafael@broomer.local');

  // Categorias.
  const cat = {};
  for (const n of ['Camisas', 'Camisetas', 'Polos', 'Calças', 'Bermudas', 'Calçados', 'Acessórios'])
    cat[n] = (await call('POST', '/categories', admin, { name: n })).id;

  // Catálogo: [referência, nome, categoria, fornecedor, coleção, modelagem, preço, mínimo, tamanhos, cores, custo]
  const catalog = [
    ['0002326', 'Camisa Linho Slim', 'Camisas', 'Têxtil Nordeste', '2026 VERÃO', 'SLIM', 289.9, 2, ['P', 'M', 'G', 'GG'], ['BRANCO', 'AZUL MARINHO'], 95],
    ['0002410', 'Polo Piquet Comfort', 'Polos', 'Confecções Atlântico', '2026 VERÃO', 'COMFORT', 189.9, 2, ['P', 'M', 'G', 'GG'], ['MARINHO', 'CINZA'], 62],
    ['0001150', 'Calça Chino Slim', 'Calças', 'Têxtil Nordeste', '2026 VERÃO', 'SLIM', 349.9, 1, ['38', '40', '42', '44', '46'], ['BEGE', 'AZUL MARINHO'], 115],
    ['0003015', 'Bermuda Sarja Comfort', 'Bermudas', 'Confecções Atlântico', '2026 VERÃO', 'COMFORT', 229.9, 2, ['38', '40', '42', '44'], ['KHAKI'], 70],
    ['0004100', 'Sapato Social Couro', 'Calçados', 'Couros do Sertão', 'BASIC COLLECTION', '', 519.9, 1, ['40', '41', '42', '43', '44'], ['PRETO'], 190],
    ['0000777', 'Cinto Couro Trançado', 'Acessórios', 'Couros do Sertão', '', '', 159.9, 3, [], [], 45],
  ];
  const sku = (ref, size, color) => [ref, size, color.replace(/\s+/g, '')].filter(Boolean).join('-');
  const variantId = {};
  for (const [ref, name, c, supplierName, collection, fit, salePrice, minQuantity, sizes, colors] of catalog) {
    const variants = [];
    for (const color of colors.length ? colors : ['']) for (const size of sizes.length ? sizes : ['']) {
      variants.push({ sku: sku(ref, size, color), size, color });
    }
    const p = await call('POST', '/products', admin, {
      reference: ref, name, categoryId: cat[c], supplierName, collection: collection || undefined, fit: fit || undefined, salePrice, minQuantity, variants,
    });
    for (const v of p.variants) variantId[v.sku] = v.id;
  }
  const costOf = Object.fromEntries(catalog.map((c) => [c[0], c[10]]));

  const item = (s, quantity) => ({ variantId: variantId[s], quantity, ...(s in variantId && {}) });
  const op = (token, type, daysAgo, hour, items, extra = {}) => ({ token, type, at: when(daysAgo, hour), items, extra });
  const entryItems = (rows) => rows.map(([s, q]) => ({ variantId: variantId[s], quantity: q, unitCost: costOf[s.split('-')[0]] }));

  const camisa = (s, c) => sku('0002326', s, c);
  const polo = (s, c) => sku('0002410', s, c);
  const calca = (s, c) => sku('0001150', s, c);
  const berm = (s) => sku('0003015', s, 'KHAKI');
  const sapato = (s) => sku('0004100', s, 'PRETO');
  const cinto = '0000777';

  const ops = [
    op(admin, 'ENTRY', 24, 9, entryItems([
      [camisa('P', 'BRANCO'), 4], [camisa('M', 'BRANCO'), 8], [camisa('G', 'BRANCO'), 6], [camisa('GG', 'BRANCO'), 3],
      [camisa('P', 'AZUL MARINHO'), 4], [camisa('M', 'AZUL MARINHO'), 8], [camisa('G', 'AZUL MARINHO'), 6], [camisa('GG', 'AZUL MARINHO'), 2],
      ...['38', '40', '42', '44', '46'].map((t, i) => [calca(t, 'BEGE'), [3, 5, 6, 5, 3][i]]),
      ...['38', '40', '42', '44', '46'].map((t, i) => [calca(t, 'AZUL MARINHO'), [3, 5, 6, 4, 2][i]]),
    ]), { origin: 'NF 4581 - Têxtil Nordeste' }),
    op(admin, 'ENTRY', 23, 10, entryItems([
      [polo('P', 'MARINHO'), 5], [polo('M', 'MARINHO'), 10], [polo('G', 'MARINHO'), 8], [polo('GG', 'MARINHO'), 4],
      [polo('P', 'CINZA'), 3], [polo('M', 'CINZA'), 6], [polo('G', 'CINZA'), 5], [polo('GG', 'CINZA'), 2],
      ...['38', '40', '42', '44'].map((t, i) => [berm(t), [4, 6, 6, 4][i]]),
    ]), { origin: 'NF 1290 - Confecções Atlântico' }),
    op(admin, 'ENTRY', 22, 9, entryItems([
      ...['40', '41', '42', '43', '44'].map((t, i) => [sapato(t), [2, 3, 4, 3, 2][i]]),
      [cinto, 10],
    ]), { origin: 'NF 3377 - Couros do Sertão' }),
    op(operator, 'SALE', 21, 11, [item(camisa('M', 'BRANCO'), 2), item(cinto, 1)], { saleReference: 'CUPOM 1001' }),
    op(operator, 'SALE', 20, 15, [item(polo('M', 'MARINHO'), 2)], { saleReference: 'CUPOM 1002' }),
    op(operator, 'SALE', 19, 10, [item(calca('42', 'BEGE'), 1), item(camisa('M', 'AZUL MARINHO'), 1)], { saleReference: 'CUPOM 1003' }),
    op(operator, 'SALE', 17, 17, [item(polo('G', 'MARINHO'), 1), item(berm('40'), 1)], { saleReference: 'CUPOM 1004' }),
    op(operator, 'SALE', 15, 12, [item(sapato('42'), 1)], { saleReference: 'CUPOM 1005' }),
    op(operator, 'SALE', 14, 18, [item(camisa('G', 'AZUL MARINHO'), 2), item(calca('44', 'BEGE'), 1)], { saleReference: 'CUPOM 1006' }),
    op(operator, 'SALE', 12, 11, [item(camisa('GG', 'AZUL MARINHO'), 2)], { saleReference: 'CUPOM 1007' }),
    op(admin, 'ENTRY', 11, 9, entryItems([[polo('M', 'MARINHO'), 6], [polo('G', 'MARINHO'), 4]]), { origin: 'NF 4702 - Confecções Atlântico' }),
    op(operator, 'SALE', 10, 16, [item(polo('M', 'CINZA'), 1), item(polo('G', 'CINZA'), 1), item(cinto, 2)], { saleReference: 'CUPOM 1008' }),
    op(operator, 'SALE', 9, 10, [item(calca('46', 'AZUL MARINHO'), 1)], { saleReference: 'CUPOM 1009' }),
    op(operator, 'SALE', 8, 14, [item(camisa('GG', 'BRANCO'), 1)], { saleReference: 'CUPOM 1010' }),
    op(manager, 'LOSS', 7, 16, [item(polo('P', 'CINZA'), 1)], { reason: 'Peça manchada no provador' }),
    op(operator, 'SALE', 6, 19, [item(berm('42'), 2), item(polo('P', 'MARINHO'), 1)], { saleReference: 'CUPOM 1011' }),
    op(operator, 'SALE', 5, 11, [item(sapato('44'), 1)], { saleReference: 'CUPOM 1012' }),
    op(operator, 'SALE', 4, 15, [item(camisa('M', 'BRANCO'), 2), item(polo('M', 'MARINHO'), 1)], { saleReference: 'CUPOM 1013' }),
    op(operator, 'SALE', 3, 10, [item(calca('40', 'AZUL MARINHO'), 1), item(camisa('P', 'BRANCO'), 1)], { saleReference: 'CUPOM 1014' }),
    op(operator, 'SALE', 2, 17, [item(polo('G', 'MARINHO'), 2), item(cinto, 1)], { saleReference: 'CUPOM 1015' }),
    op(manager, 'CUSTOMER_RETURN', 2, 18, [item(camisa('M', 'BRANCO'), 1)], { reason: 'Troca de tamanho' }),
    op(operator, 'SALE', 1, 13, [item(camisa('M', 'AZUL MARINHO'), 2), item(calca('42', 'BEGE'), 1)], { saleReference: 'CUPOM 1016' }),
  ];

  for (const o of ops) {
    const res = await call('POST', '/operations', o.token, {
      type: o.type, occurredAt: o.at, idempotencyKey: uuid(), items: o.items, ...o.extra,
    });
    process.stdout.write(`#${res.number} ${o.type} `);
  }
  console.log('\nok');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
