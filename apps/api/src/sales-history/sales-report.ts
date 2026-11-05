import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { MAX_MONEY, MAX_QUANTITY } from '../common/limits';

// Leitura do relatório "VENDAS POR CUPOM" do ERP (.xls ou .xlsx). As colunas
// são localizadas pelo título. Só o que a análise precisa é lido: CPF/CGC e
// celular do cliente, se existirem na planilha, são ignorados (LGPD).
//
// Estrutura do relatório (conferida nos arquivos reais):
// - uma linha por produto + tamanho vendido; a data e o vendedor podem vir só
//   na primeira linha do grupo;
// - linhas de subtotal (por produto, vendedor e dia) e o "TOTAL GERAL" no fim.
//   Uma linha de venda é a que tem VALOR UN; subtotais não têm. Não dá para
//   confiar no texto "Total", que às vezes vem cortado;
// - devolução é uma linha cujo produto começa com "DEVOLUÇÃO", com quantidade
//   negativa;
// - o relatório não traz código nem cor, e a descrição vem cortada.
// A soma das linhas é conferida com o TOTAL GERAL do próprio relatório: se não
// bater, a importação é recusada (leitura errada não entra em silêncio).

export interface SaleRow {
  line: number;
  soldOn: string; // AAAA-MM-DD
  seller: string;
  description: string;
  size: string;
  code: string | null;
  unitPrice: number;
  quantity: number;
  discount: number;
  cost: number;
  returned: number;
  total: number;
  isReturn: boolean;
}

export interface ReportIssue {
  line?: number;
  message: string;
}

export interface SalesReport {
  fileHash: string;
  store: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  columns: string[];
  rows: SaleRow[];
  totals: {
    pieces: number;
    sold: number;
    returned: number;
    total: number;
    discount: number;
    cost: number;
    returnsValue: number;
  };
  reportTotals: {
    pieces: number | null;
    total: number | null;
  };
  warnings: ReportIssue[];
  errors: ReportIssue[];
}

export class SalesReportFormatError extends Error {}

type Column =
  | 'date'
  | 'seller'
  | 'product'
  | 'size'
  | 'code'
  | 'unitPrice'
  | 'quantity'
  | 'discount'
  | 'cost'
  | 'returned'
  | 'total';

const HEADERS: Record<Column, (title: string) => boolean> = {
  date: (t) => t === 'DATA',
  seller: (t) => t === 'VENDEDOR',
  product: (t) => t === 'PRODUTO',
  size: (t) => t === 'TAMANHO',
  code: (t) => t === 'CODIGO',
  unitPrice: (t) => t === 'VALOR UN',
  quantity: (t) => t === 'QTDE',
  // O primeiro "DESCONTO" é em R$ (o seguinte, "% DESCONTO", é calculado).
  discount: (t) => t === 'DESCONTO',
  cost: (t) => t === 'CUSTO',
  returned: (t) => t === 'DEVOLUCAO',
  total: (t) => t === 'TOTAL',
};
const REQUIRED: Column[] = [
  'date',
  'product',
  'unitPrice',
  'quantity',
  'total',
];
const LABELS: Record<Column, string> = {
  date: 'DATA',
  seller: 'VENDEDOR',
  product: 'PRODUTO',
  size: 'TAMANHO',
  code: 'CÓDIGO',
  unitPrice: 'VALOR UN',
  quantity: 'QTDE',
  discount: 'DESCONTO',
  cost: 'CUSTO',
  returned: 'DEVOLUÇÃO',
  total: 'TOTAL',
};

const MAX_LINES = 100_000;
// "DEVOLUÇÃO CAMISA ..." (sem acento depois de normalizar).
const RETURN_PREFIX = /^DEVOLUCAO\s/i;

const unaccent = (text: string) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const clean = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim()
    : '';

const round2 = (value: number) => Math.round(value * 100) / 100;

function numberCell(value: unknown): number | null {
  if (typeof value === 'number') return value;
  const text = clean(value);
  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

// Data do relatório: texto "dd/mm/aaaa" (com ou sem hora) ou número de série
// do Excel. Devolve AAAA-MM-DD ou null.
function dayCell(value: unknown): string | null {
  if (typeof value === 'number') {
    // Número de série do Excel (dias desde 30/12/1899; datas depois de 1900).
    if (value < 61 || value > 80_000) return null;
    const date = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000,
    );
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  const text = clean(value);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/.exec(text);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/.exec(text);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function validDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
}

export function parseSalesReport(buffer: Buffer): SalesReport {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  } catch {
    throw new SalesReportFormatError(
      'Não foi possível ler o arquivo. Envie o relatório exportado pelo ERP (.xls ou .xlsx).',
    );
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new SalesReportFormatError('A planilha está vazia.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });

  const headerIndex = rows.findIndex((row) => {
    const titles = row.map((cell) => unaccent(clean(cell)).toUpperCase());
    return titles.includes('DATA') && titles.includes('PRODUTO');
  });
  if (headerIndex < 0) {
    throw new SalesReportFormatError(
      'Não encontrei a linha de títulos (DATA, PRODUTO, QTDE...). Este é o relatório "vendas por cupom"?',
    );
  }
  const titles = rows[headerIndex].map((cell) =>
    unaccent(clean(cell)).toUpperCase(),
  );
  const column = {} as Record<Column, number>;
  for (const key of Object.keys(HEADERS) as Column[]) {
    column[key] = titles.findIndex((title) => HEADERS[key](title));
  }
  const missing = REQUIRED.filter((key) => column[key] < 0);
  if (missing.length) {
    throw new SalesReportFormatError(
      `Colunas obrigatórias não encontradas: ${missing.map((k) => LABELS[k]).join(', ')}.`,
    );
  }

  // Cabeçalho: "PERÍODO: 01/10/2025 A 31/10/2026   PRAÇA/LOJA(S): 104 - BROOMER".
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  let store: string | null = null;
  for (const row of rows.slice(0, headerIndex)) {
    const text = row.map(clean).join(' ');
    const period =
      /PER[IÍ]ODO:\s*(\d{2})\/(\d{2})\/(\d{4})\s*A\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(
        text,
      );
    if (period) {
      periodFrom = `${period[3]}-${period[2]}-${period[1]}`;
      periodTo = `${period[6]}-${period[5]}-${period[4]}`;
    }
    const shop = /LOJA\(S\):\s*(.+?)(?:\s{2,}|$)/.exec(text);
    if (shop) store = shop[1].trim();
  }

  const warnings: ReportIssue[] = [];
  const errors: ReportIssue[] = [];
  const parsed: SaleRow[] = [];
  const get = (row: unknown[], key: Column) =>
    column[key] < 0 ? null : row[column[key]];

  // Atribuídos dentro do forEach; o tipo explícito evita o estreitamento para null.
  let reportPieces = null as number | null;
  let reportTotal = null as number | null;
  // Data e vendedor valem para as linhas seguintes quando vierem em branco.
  let currentDay: string | null = null;
  let currentSeller = '';

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const line = headerIndex + offset + 2;
    if (!row.some((cell) => clean(cell))) return;
    const joined = row.map(clean).join(' ');

    if (/^TOTAL GERAL/i.test(clean(row.find((cell) => clean(cell))))) {
      reportPieces = numberCell(get(row, 'quantity'));
      reportTotal = numberCell(get(row, 'total'));
      return;
    }
    // Rodapé de paginação ("1/1").
    if (/^\d+\s*\/\s*\d+$/.test(joined)) return;

    const day = dayCell(get(row, 'date'));
    const sellerText = clean(get(row, 'seller'));
    const unitPrice = numberCell(get(row, 'unitPrice'));
    const quantity = numberCell(get(row, 'quantity'));
    const product = clean(get(row, 'product'));

    // Subtotal (produto, vendedor ou dia): não tem valor unitário.
    if (
      unitPrice === null ||
      /\bTotal$/.test(product) ||
      /\bTotal$/.test(sellerText)
    ) {
      // O dia e o vendedor do subtotal não mudam o contexto das linhas.
      return;
    }

    if (day) currentDay = day;
    if (sellerText) currentSeller = sellerText;
    if (!currentDay) {
      errors.push({ line, message: 'Linha de venda sem data.' });
      return;
    }
    if (!validDay(currentDay)) {
      errors.push({ line, message: `Data inválida (${currentDay}).` });
      return;
    }
    if (!product) {
      errors.push({ line, message: 'Produto em branco.' });
      return;
    }
    if (quantity === null || !Number.isInteger(quantity) || quantity === 0) {
      errors.push({
        line,
        message: `Quantidade inválida (${clean(get(row, 'quantity')) || 'vazia'}).`,
      });
      return;
    }
    if (Math.abs(quantity) > MAX_QUANTITY) {
      errors.push({ line, message: 'Quantidade acima do limite.' });
      return;
    }
    const discount = numberCell(get(row, 'discount')) ?? 0;
    const cost = numberCell(get(row, 'cost')) ?? 0;
    const returned = numberCell(get(row, 'returned')) ?? 0;
    const total = numberCell(get(row, 'total'));
    if (total === null) {
      errors.push({ line, message: 'Total da linha ausente.' });
      return;
    }
    if (
      [unitPrice, discount, cost, returned, total].some(
        (n) => Math.abs(n) > MAX_MONEY * 1000,
      )
    ) {
      errors.push({ line, message: 'Valor acima do limite.' });
      return;
    }
    const isReturn = RETURN_PREFIX.test(unaccent(product));
    // Na devolução o desconto também vem negativo (estorna o da venda).
    if (unitPrice < 0 || returned < 0 || (discount < 0 && !isReturn)) {
      errors.push({
        line,
        message:
          'Valor unitário, devolução e (fora de devoluções) desconto não podem ser negativos.',
      });
      return;
    }
    // Devolução tem quantidade negativa; venda, positiva.
    if (isReturn !== quantity < 0) {
      warnings.push({
        line,
        message: `Linha "${product.slice(0, 40)}" com quantidade ${quantity}: confira se é venda ou devolução.`,
      });
    }
    const code = clean(get(row, 'code'));
    parsed.push({
      line,
      soldOn: currentDay,
      seller: currentSeller || 'Sem vendedor',
      description: isReturn ? product.replace(/^\S+\s+/, '') : product,
      size: clean(get(row, 'size')).toUpperCase(),
      code: code || null,
      unitPrice: round2(unitPrice),
      quantity,
      discount: round2(discount),
      cost: round2(cost),
      returned: round2(returned),
      total: round2(total),
      isReturn,
    });
  });

  if (parsed.length > MAX_LINES) {
    errors.push({
      message: `O relatório tem mais de ${MAX_LINES} linhas: divida por período.`,
    });
  }
  if (parsed.length === 0 && errors.length === 0) {
    errors.push({ message: 'Nenhuma linha de venda encontrada no relatório.' });
  }

  const sum = (pick: (row: SaleRow) => number) =>
    round2(parsed.reduce((acc, row) => acc + pick(row), 0));
  const totals = {
    pieces: parsed.reduce((acc, row) => acc + row.quantity, 0),
    sold: parsed.reduce((acc, row) => acc + Math.max(row.quantity, 0), 0),
    returned: parsed.reduce((acc, row) => acc + Math.min(row.quantity, 0), 0),
    total: sum((row) => row.total),
    discount: sum((row) => row.discount),
    cost: sum((row) => row.cost),
    returnsValue: sum((row) => row.returned),
  };

  // Conferência com o TOTAL GERAL do relatório.
  if (reportPieces === null && reportTotal === null) {
    warnings.push({
      message:
        'O relatório não tem a linha TOTAL GERAL: não foi possível conferir a soma.',
    });
  } else {
    if (reportPieces !== null && reportPieces !== totals.pieces) {
      errors.push({
        message: `A soma das peças (${totals.pieces}) não bate com o TOTAL GERAL do relatório (${reportPieces}). A leitura foi recusada para não gravar números errados.`,
      });
    }
    if (reportTotal !== null && Math.abs(reportTotal - totals.total) > 0.05) {
      errors.push({
        message: `A soma dos valores (${totals.total.toFixed(2)}) não bate com o TOTAL GERAL do relatório (${reportTotal.toFixed(2)}).`,
      });
    }
  }

  // Aviso de lacuna: período vai além da última venda.
  const days = parsed.map((r) => r.soldOn).sort();
  const first = days[0];
  const last = days[days.length - 1];
  if (periodFrom && periodTo && last) {
    const gap =
      (Date.parse(`${periodTo}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) /
      86_400_000;
    if (gap > 7) {
      warnings.push({
        message: `O período do relatório termina em ${periodTo.split('-').reverse().join('/')}, mas a última venda é de ${last.split('-').reverse().join('/')} (${Math.round(gap)} dias antes). Confira se faltam vendas no arquivo.`,
      });
    }
    if (first < periodFrom || last > periodTo) {
      errors.push({
        message:
          'Há vendas fora do período informado no cabeçalho do relatório.',
      });
    }
  }

  return {
    fileHash: createHash('sha256').update(buffer).digest('hex'),
    store,
    periodFrom: periodFrom ?? first ?? null,
    periodTo: periodTo ?? last ?? null,
    columns: (Object.keys(column) as Column[])
      .filter((key) => column[key] >= 0)
      .map((key) => LABELS[key]),
    rows: parsed,
    totals,
    reportTotals: { pieces: reportPieces, total: reportTotal },
    warnings,
    errors,
  };
}
