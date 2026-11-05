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
