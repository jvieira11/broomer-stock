import * as XLSX from 'xlsx';
import { parseSalesReport } from './sales-report';

type Cell = string | number | null;

// Monta um .xlsx no leiaute do relatório "VENDAS POR CUPOM" (dados fictícios):
// título, período, cabeçalho, linhas, subtotais e TOTAL GERAL.
function report(
  body: Cell[][],
  options: { withPersonal?: boolean; totals?: [number, number] | null } = {},
) {
  const header = [
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
  ];
  const sheet: Cell[][] = [
    ['RELATÓRIO VENDAS POR CUPOM     DATA: 04/11/2026'],
    ['PERÍODO: 01/10/2026 A 31/10/2026          PRAÇA/LOJA(S): 104 - BROOMER'],
    [],
    options.withPersonal ? [...header, 'CPF/CGC', 'CELULAR'] : header,
    ...body,
  ];
  if (options.totals !== null) {
    const [pieces, total] = options.totals ?? [0, 0];
    sheet.push([
      'TOTAL GERAL',
      null,
      null,
      null,
      null,
      pieces,
      null,
      null,
      null,
      null,
      total,
    ]);
  }
  sheet.push(['1/1']);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet), 'Sheet');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// 2 linhas de venda do mesmo dia (a data e o vendedor só na primeira), uma
// devolução, e subtotais (produto, vendedor, dia) sem valor unitário.
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
  [null, null, 'DEVOLUÇÃO POLO PIQUET', 'M', 150, -1, -10, 0, -50, 150, -140],
  ['01/10/2026', 'Ana Total', null, null, null, 2, 10, 2, 130, 150, 440],
  ['01/10/2026 Total', null, null, null, null, 2, 10, 2, 130, 150, 440],
];

describe('relatório de vendas por cupom', () => {
  it('lê as linhas, repete data e vendedor, ignora subtotais e confere o total', () => {
    const r = parseSalesReport(report(BODY, { totals: [2, 440] }));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(3);
    expect(r.rows.map((x) => [x.soldOn, x.seller, x.size, x.quantity])).toEqual(
      [
        ['2026-10-01', 'Ana', 'M', 2],
        ['2026-10-01', 'Ana', 'G', 1],
        ['2026-10-01', 'Ana', 'M', -1],
      ],
    );
    expect(r.totals).toMatchObject({
      pieces: 2,
      sold: 3,
      returned: -1,
      total: 440,
      discount: 10,
      cost: 130,
    });
    expect([r.periodFrom, r.periodTo, r.store]).toEqual([
      '2026-10-01',
      '2026-10-31',
      '104 - BROOMER',
    ]);
  });

  it('devolução: tira o prefixo da descrição e aceita desconto negativo', () => {
    const r = parseSalesReport(report(BODY, { totals: [2, 440] }));
    const back = r.rows[2];
    expect(back.isReturn).toBe(true);
    expect(back.description).toBe('POLO PIQUET');
    expect(back.discount).toBe(-10);
  });

  it('desconto negativo fora de devolução é erro', () => {
    const r = parseSalesReport(
      report(
        [['01/10/2026', 'Ana', 'CALÇA', '42', 100, 1, -5, 0, 40, 0, 105]],
        { totals: [1, 105] },
      ),
    );
    expect(r.errors[0].message).toContain('não podem ser negativos');
  });

  it('recusa quando a soma não bate com o TOTAL GERAL', () => {
    const r = parseSalesReport(report(BODY, { totals: [5, 999] }));
    expect(r.errors.map((e) => e.message)).toEqual([
      expect.stringContaining('não bate com o TOTAL GERAL'),
      expect.stringContaining('valores'),
    ]);
  });

  it('avisa quando falta o TOTAL GERAL', () => {
    const r = parseSalesReport(report(BODY, { totals: null }));
    expect(r.errors).toEqual([]);
    expect(r.warnings[0].message).toContain('TOTAL GERAL');
  });

  it('não lê CPF nem celular do cliente', () => {
    const rows: Cell[][] = BODY.map((row, i) =>
      i === 0 ? [...row, '123.456.789-00', '082999999999'] : row,
    );
    const r = parseSalesReport(
      report(rows, { withPersonal: true, totals: [2, 440] }),
    );
    expect(r.columns).not.toContain('CPF/CGC');
    expect(JSON.stringify(r.rows)).not.toContain('123.456.789');
    expect(JSON.stringify(r.rows)).not.toContain('082999999999');
  });

  it('avisa quando as vendas terminam bem antes do fim do período', () => {
    const r = parseSalesReport(report(BODY, { totals: [2, 440] }));
    expect(
      r.warnings.some((w) => w.message.includes('Confira se faltam vendas')),
    ).toBe(true);
  });

  it('aceita a data como número de série do Excel', () => {
    // 46296 = 01/10/2026
    const r = parseSalesReport(
      report([[46296, 'Ana', 'CAMISA', 'M', 100, 1, 0, 0, 40, 0, 100]], {
        totals: [1, 100],
      }),
    );
    expect(r.rows[0].soldOn).toBe('2026-10-01');
  });

  it('recusa arquivo que não é o relatório', () => {
    expect(() => parseSalesReport(Buffer.from('não é planilha'))).toThrow();
  });
});
