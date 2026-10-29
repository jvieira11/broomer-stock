import * as XLSX from 'xlsx';

// Monta um .xls no mesmo leiaute do relatório "ESTOQUE FINAL DO DIA" do ERP
// (títulos espalhados, colunas vazias entre eles, total geral e paginação).
// Os dados são fictícios.
export type ErpRow = [
  code: string,
  description: string,
  supplier: string,
  size: string,
  collection: string,
  color: string,
  unitPrice: number,
  fit: string,
  quantity: number,
  cost: number,
];

export function erpReport(rows: ErpRow[], day = '09/11/2024') {
  const sheet: (string | number | null)[][] = [
    ['RELATÓRIO ESTOQUE FINAL DO DIA     DATA: 12/11/2024   HORA: 13:00'],
    [`DIA: ${day}          LOJA(S): 104 - BROOMER`],
    [],
    [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'ESTOQUE FINAL DO DIA',
    ],
    [],
    [
      'CÓDIGO',
      'DESCRIÇÃO',
      'FORNECEDOR - NOME FANTASIA',
      'TAMANHO',
      null,
      null,
      'COLEÇÃO',
      null,
      'COR',
      'PÇ UNIT',
      'LINHA/MODELAGEM',
      'TQTDE',
      null,
      'TVALOR',
      null,
      'TCUSTO',
    ],
  ];
  let total = 0;
  for (const [
    code,
    description,
    supplier,
    size,
    collection,
    color,
    price,
    fit,
    quantity,
    cost,
  ] of rows) {
    total += quantity;
    sheet.push([
      code,
      description,
      supplier,
      size,
      null,
      null,
      collection,
      null,
      color,
      price,
      fit,
      quantity,
      null,
      price * quantity,
      null,
      cost * quantity,
    ]);
  }
  sheet.push([
    'TOTAL GERAL',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    total,
  ]);
  sheet.push([null, null, null, null, null, '1/1']);

  const book = XLSX.utils.book_new();
  // Códigos como texto, como o ERP exporta (preserva zeros à esquerda).
  const ws = XLSX.utils.aoa_to_sheet(sheet);
  XLSX.utils.book_append_sheet(book, ws, 'Sheet');
  return Buffer.from(
    XLSX.write(book, { type: 'buffer', bookType: 'biff8' }) as Uint8Array,
  );
}
