import * as XLSX from 'xlsx';
import { erpReport } from '../../../test/erp-report';
import {
  categoryFromDescription,
  normalizeCollection,
  normalizeColor,
  normalizeSize,
  parseErpStockReport,
} from './erp-stock-report';

describe('padronização do relatório do ERP', () => {
  it.each([
    ['DV', ''],
    ['-', ''],
    ['58M', '58 M'],
    ['58  m', '58 M'],
    ['48 M', '48 M'],
    ['37/38', '37/38'],
    ['  P ', 'P'],
  ])('tamanho %p → %p', (from, to) => expect(normalizeSize(from)).toBe(to));

  it.each([
    ['DV', ''],
    ['-', ''],
    ['SALMON', 'SALMAO'],
    ['azul  marinho', 'AZUL MARINHO'],
  ])('cor %p → %p', (from, to) => expect(normalizeColor(from)).toBe(to));

  it('coleção usa VERÃO com acento', () => {
    expect(normalizeCollection('2024 VERAO')).toBe('2024 VERÃO');
    expect(normalizeCollection('2019 VERÃO')).toBe('2019 VERÃO');
    expect(normalizeCollection('')).toBeNull();
  });

  it('categoria é a primeira palavra da descrição', () => {
    expect(categoryFromDescription('CAMISA ML LINHO SLIM')).toBe('Camisa');
    expect(categoryFromDescription('CALCA SOCIAL')).toBe('Calça');
    expect(categoryFromDescription('CALÇA JEANS')).toBe('Calça');
    expect(categoryFromDescription('ZZ GRAVATA POLIESTER')).toBe('Gravata');
  });
});

describe('parseErpStockReport', () => {
  it('lê o leiaute do ERP, agrupa por referência e preserva zeros à esquerda', () => {
    const report = parseErpStockReport(
      erpReport([
        [
          '0002326215021',
          'CAMISA LINHO SLIM',
          'FORN A',
          'P',
          '2024 VERAO',
          'PRETO',
          199.9,
          'SLIM',
          2,
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
          '0002326215731',
          'CAMISA LINHO SLIM',
          'FORN A',
          'GG',
          '2024 VERAO',
          'PRETO',
          219.9,
          'SLIM',
          1,
          55,
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
      ]),
    );

    expect(report).toMatchObject({
      reportDate: '2024-11-09',
      store: '104 - BROOMER',
      rowCount: 4,
      reportTotal: 2,
      errors: [],
    });
    const camisa = report.models.find((m) => m.reference === '0002326')!;
    expect(camisa).toMatchObject({
      name: 'CAMISA LINHO SLIM',
      category: 'Camisa',
      collection: '2024 VERÃO',
      fit: 'SLIM',
      salePrice: 199.9,
    });
    expect(
      camisa.variants.map((v) => [
        v.sku,
        v.size,
        v.quantity,
        v.unitCost,
        v.priceOverride,
      ]),
    ).toEqual([
      ['0002326215021', 'P', 2, 50, null],
      ['0002326215724', 'M', 0, null, null],
      ['0002326215731', 'GG', 1, 55, 219.9],
    ]);
    const colar = report.models.find((m) => m.reference === '0001386')!;
    expect(colar).toMatchObject({ fit: null, category: 'Colar' });
    // Saldo negativo entra como 0 e vira aviso.
    expect(colar.variants[0]).toMatchObject({
      size: '',
      color: '',
      reportQuantity: -1,
      quantity: 0,
    });
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].sku).toBe('0001386001001');
    expect(report.warnings[0].message).toContain('Saldo negativo');
  });

  it('acusa SKU repetido e combinação repetida depois de padronizar', () => {
    const report = parseErpStockReport(
      erpReport([
        ['0001000000001', 'CALCA X', 'F', '58M', 'C', 'PRETO', 10, '-', 1, 5],
        ['0001000000002', 'CALCA X', 'F', '58 M', 'C', 'PRETO', 10, '-', 1, 5],
        ['0001000000002', 'CALCA X', 'F', '60', 'C', 'PRETO', 10, '-', 1, 5],
      ]),
    );
    expect(report.errors.map((e) => e.message)).toEqual([
      expect.stringContaining('SKU repetido'),
      expect.stringContaining('já tem 58 M / PRETO'),
    ]);
  });

  it('recusa arquivo que não é o relatório', () => {
    expect(() => parseErpStockReport(Buffer.from('não é planilha'))).toThrow();
  });
});

describe('limite de quantidade na planilha do ERP', () => {
  it('recusa saldo acima do limite em vez de estourar o banco', () => {
    const report = parseErpStockReport(
      erpReport([
        [
          '0001000000001',
          'CAMISA LIMITE',
          'FORN',
          'M',
          '2026',
          'AZUL',
          100,
          'SLIM',
          3_000_000_000,
          10,
        ],
        [
          '0001000000002',
          'CAMISA LIMITE',
          'FORN',
          'G',
          '2026',
          'AZUL',
          100,
          'SLIM',
          5,
          10,
        ],
      ]),
    );
    expect(report.errors.map((e) => e.message).join(' ')).toMatch(
      /acima do limite/,
    );
    expect(report.errors).toHaveLength(1);
  });
});

// Leiaute enxuto do ERP: sem as colunas COR e PÇ UNIT (relatório real de 2026).
function reportWithoutColor(
  rows: [
    code: string,
    description: string,
    size: string,
    quantity: number,
    value: number,
    cost: number,
  ][],
) {
  const sheet = [
    ['RELATÓRIO ESTOQUE FINAL DO DIA     DATA: 04/11/2026   HORA: 13:00'],
    ['DIA: 31/10/2026          LOJA(S): 104 - BROOMER'],
    [],
    [],
    [
      'CÓDIGO',
      'DESCRIÇÃO',
      'FORNECEDOR - NOME FANTASIA',
      'TAMANHO',
      'COLEÇÃO',
      'TQTDE',
      'TVALOR',
      'TCUSTO',
    ],
    ...rows.map(([code, description, size, quantity, value, cost]) => [
      code,
      description,
      'FORN',
      size,
      '2026 VERAO',
      quantity,
      value,
      cost,
    ]),
    ['TOTAL GERAL', null, null, null, null, rows.reduce((s, r) => s + r[3], 0)],
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet), 'Sheet');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('relatório sem a coluna COR', () => {
  it('identifica a cor pelo código (dígitos 8 a 10) e avisa', () => {
    const report = parseErpStockReport(
      reportWithoutColor([
        ['0002326215021', 'CAMISA LINHO', 'P', 2, 200, 80],
        ['0002326215724', 'CAMISA LINHO', 'M', 1, 100, 40],
        ['0002326224702', 'CAMISA LINHO', 'P', 3, 300, 120],
      ]),
    );
    expect(report.errors).toEqual([]);
    expect(report.models).toHaveLength(1);
    const variants = report.models[0].variants;
    expect(variants.map((v) => [v.size, v.color])).toEqual([
      ['P', 'COR 215'],
      ['M', 'COR 215'],
      ['P', 'COR 224'],
    ]);
    // Sem PÇ UNIT, o preço sai de valor ÷ quantidade.
    expect(variants[0].salePrice).toBe(100);
    expect(report.columns).not.toContain('COR');
    expect(report.warnings[0].message).toContain('não tem a coluna COR');
  });

  it('referência usada por produtos diferentes vira modelos separados, sem bloquear', () => {
    const report = parseErpStockReport(
      reportWithoutColor([
        ['0099912150001', 'CAMISA TECH CHEVRON', 'P', 1, 100, 40],
        ['0099912150002', 'CAMISA TECH CHEVRON', 'M', 1, 100, 40],
        ['0099912230003', 'CAMISA MARINE LISA', 'P', 1, 120, 50],
      ]),
    );
    expect(report.errors).toEqual([]);
    expect(report.models.map((m) => [m.reference, m.name])).toEqual([
      ['0099912', 'CAMISA TECH CHEVRON'],
      ['0099912-B', 'CAMISA MARINE LISA'],
    ]);
    expect(report.models.flatMap((m) => m.variants).map((v) => v.sku)).toEqual([
      '0099912150001',
      '0099912150002',
      '0099912230003',
    ]);
    expect(
      report.warnings.some((w) => w.message.includes('2 produtos diferentes')),
    ).toBe(true);
  });
});
