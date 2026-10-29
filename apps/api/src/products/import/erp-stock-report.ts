import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';

// Leitura do relatório "ESTOQUE FINAL DO DIA" exportado pelo ERP da loja
// (.xls ou .xlsx). Uma linha por SKU; as colunas são localizadas pelo título,
// porque o ERP muda a posição conforme as colunas escolhidas na exportação.
//
// Regras de padronização (confirmadas com a loja):
// - código: texto, zeros à esquerda preservados; a referência do modelo é o
//   código sem os 6 últimos dígitos (13 dígitos → 7 de referência);
// - tamanho e cor "DV" ou "-" = não se aplica (tamanho único / sem cor);
// - grafias unificadas: "58M" → "58 M", SALMON → SALMAO, VERAO → VERÃO;
// - categoria = primeira palavra da descrição (CALCA → Calça);
// - saldo negativo entra como 0 e fica listado para conferência.

export interface ErpVariant {
  line: number;
  sku: string;
  size: string;
  color: string;
  // Saldo do relatório (pode ser negativo) e o que será importado (>= 0).
  reportQuantity: number;
  quantity: number;
  salePrice: number | null;
  unitCost: number | null;
}

export interface ErpModel {
  reference: string;
  name: string;
  category: string | null;
  supplier: string | null;
  collection: string | null;
  fit: string | null;
  salePrice: number;
  variants: (ErpVariant & { priceOverride: number | null })[];
}

export interface ReportIssue {
  line?: number;
  sku?: string;
  message: string;
}

export interface Normalization {
  field: 'Tamanho' | 'Cor' | 'Coleção' | 'Categoria';
  from: string;
  to: string;
  count: number;
}

export interface ErpStockReport {
  fileHash: string;
  reportDate: string | null;
  store: string | null;
  columns: string[];
  models: ErpModel[];
  rowCount: number;
  reportTotal: number | null;
  normalizations: Normalization[];
  warnings: ReportIssue[];
  errors: ReportIssue[];
}

export class ReportFormatError extends Error {}

type Column =
  | 'code'
  | 'description'
  | 'supplier'
  | 'size'
  | 'collection'
  | 'color'
  | 'unitPrice'
  | 'fit'
  | 'quantity'
  | 'value'
  | 'cost';

// Títulos já sem acento e em maiúsculas.
const HEADERS: Record<Column, (title: string) => boolean> = {
  code: (t) => t === 'CODIGO',
  description: (t) => t === 'DESCRICAO',
  supplier: (t) => t.startsWith('FORNECEDOR'),
  size: (t) => t === 'TAMANHO',
  collection: (t) => t === 'COLECAO',
  color: (t) => t === 'COR',
  unitPrice: (t) => t === 'PC UNIT',
  fit: (t) => t.startsWith('LINHA'),
  quantity: (t) => t === 'TQTDE',
  value: (t) => t === 'TVALOR',
  cost: (t) => t === 'TCUSTO',
};
const REQUIRED: Column[] = ['code', 'description', 'size', 'color', 'quantity'];
const LABELS: Record<Column, string> = {
  code: 'CÓDIGO',
  description: 'DESCRIÇÃO',
  supplier: 'FORNECEDOR',
  size: 'TAMANHO',
  collection: 'COLEÇÃO',
  color: 'COR',
  unitPrice: 'PÇ UNIT',
  fit: 'LINHA/MODELAGEM',
  quantity: 'TQTDE',
  value: 'TVALOR',
  cost: 'TCUSTO',
};

// Remove os acentos (marcas combinantes U+0300–U+036F após a decomposição).
const unaccent = (text: string) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const clean = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s+/g, ' ').trim()
    : '';

const NOT_APPLICABLE = new Set(['', 'DV', '-']);
const COLOR_ALIASES: Record<string, string> = { SALMON: 'SALMAO' };
const CATEGORY_ALIASES: Record<string, string> = {
  CALCA: 'CALÇA',
  SANDALIA: 'SANDÁLIA',
  SAPATENIS: 'SAPATÊNIS',
};
const EMPTY_FIT = new Set(['', '-', 'NAO CADASTRADO']);

const titleCase = (word: string) =>
  word.charAt(0) + word.slice(1).toLocaleLowerCase('pt-BR');

export function normalizeSize(raw: string) {
  const size = clean(raw).toUpperCase();
  if (NOT_APPLICABLE.has(size)) return '';
  // "58M" e "58  M" → "58 M"
  return size.replace(/^(\d+)\s*([A-Z]+)$/, '$1 $2');
}

export function normalizeColor(raw: string) {
  const color = clean(raw).toUpperCase();
  if (NOT_APPLICABLE.has(color)) return '';
  return COLOR_ALIASES[color] ?? color;
}

export function normalizeCollection(raw: string) {
  const collection = clean(raw)
    .toUpperCase()
    .replace(/\bVERAO\b/g, 'VERÃO');
  return collection || null;
}

// Primeira palavra da descrição; "ZZ" (prefixo do ERP) é ignorado.
export function categoryFromDescription(description: string) {
  const words = clean(description).toUpperCase().split(' ');
  const word = words[0] === 'ZZ' ? words[1] : words[0];
  if (!word) return null;
  const canonical = CATEGORY_ALIASES[unaccent(word)] ?? word;
  return titleCase(canonical);
}

const round = (value: number, decimals: number) =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;

function numberCell(value: unknown): number | null {
  if (typeof value === 'number') return value;
  const text = clean(value);
  if (!text) return null;
  // "1.234,56" ou "1234.56"
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function mode(values: number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

export function parseErpStockReport(buffer: Buffer): ErpStockReport {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      raw: true,
      cellDates: false,
    });
  } catch {
    throw new ReportFormatError(
      'Não foi possível ler o arquivo. Envie o relatório exportado pelo ERP (.xls ou .xlsx).',
    );
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new ReportFormatError('A planilha está vazia.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => unaccent(clean(cell)).toUpperCase() === 'CODIGO'),
  );
  if (headerIndex < 0) {
    throw new ReportFormatError(
      'Não encontrei a linha de títulos (CÓDIGO, DESCRIÇÃO, TAMANHO...). Este é o relatório "estoque final do dia"?',
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
    throw new ReportFormatError(
      `Colunas obrigatórias não encontradas: ${missing.map((k) => LABELS[k]).join(', ')}.`,
    );
  }

  // Cabeçalho do relatório: "DIA: 09/11/2024   LOJA(S): 104 - BROOMER".
  let reportDate: string | null = null;
  let store: string | null = null;
  for (const row of rows.slice(0, headerIndex)) {
    const text = row.map(clean).join(' ');
    const day = /DIA:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
    if (day) reportDate = `${day[3]}-${day[2]}-${day[1]}`;
    const shop = /LOJA\(S\):\s*(.+)$/.exec(text);
    if (shop) store = shop[1].trim();
  }

  const warnings: ReportIssue[] = [];
  const errors: ReportIssue[] = [];
  const counts = new Map<string, Normalization>();
  const track = (field: Normalization['field'], from: string, to: string) => {
    if (from === to) return;
    const key = `${field}|${from}|${to}`;
    const entry = counts.get(key) ?? { field, from, to, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  };

  const get = (row: unknown[], key: Column) =>
    column[key] < 0 ? null : row[column[key]];

  interface Parsed extends ErpVariant {
    reference: string;
    name: string;
    category: string | null;
    supplier: string | null;
    collection: string | null;
    fit: string | null;
  }
  const parsed: Parsed[] = [];
  // Atribuído dentro do forEach; o tipo explícito evita o estreitamento para null.
  let reportTotal = null as number | null;

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const line = headerIndex + offset + 2;
    const first = clean(get(row, 'code'));
    if (/^TOTAL GERAL/i.test(first)) {
      reportTotal = numberCell(get(row, 'quantity'));
      return;
    }
    if (!row.some((cell) => clean(cell))) return;
    // Rodapé de paginação ("1/1") e outras linhas sem código.
    if (!first) return;
    if (typeof get(row, 'code') === 'number') {
      errors.push({
        line,
        message: `Código ${first} veio como número: zeros à esquerda podem ter sido perdidos. Exporte de novo pelo ERP sem abrir no Excel.`,
      });
      return;
    }
    if (!/^\d{6,20}$/.test(first)) {
      warnings.push({
        line,
        message: `Linha ignorada (código "${first}" não reconhecido).`,
      });
      return;
    }

    const sku = first;
    const name = clean(get(row, 'description'));
    if (!name) {
      errors.push({ line, sku, message: 'Descrição em branco.' });
      return;
    }

    const rawSize = clean(get(row, 'size')).toUpperCase();
    const size = normalizeSize(rawSize);
    track('Tamanho', rawSize, size);
    const rawColor = clean(get(row, 'color')).toUpperCase();
    const color = normalizeColor(rawColor);
    track('Cor', rawColor, color);
    const rawCollection = clean(get(row, 'collection')).toUpperCase();
    const collection = normalizeCollection(rawCollection);
    track('Coleção', rawCollection, collection ?? '');
    const firstWord = clean(name).split(' ')[0]?.toUpperCase() ?? '';
    const category = categoryFromDescription(name);
    if (
      category &&
      unaccent(category.toUpperCase()) !== unaccent(firstWord) &&
      firstWord !== 'ZZ'
    ) {
      track('Categoria', firstWord, category);
    }

    const reportQuantity = numberCell(get(row, 'quantity'));
    if (reportQuantity === null || Number.isNaN(reportQuantity)) {
      errors.push({
        line,
        sku,
        message: 'Quantidade (TQTDE) ausente ou inválida.',
      });
      return;
    }
    if (!Number.isInteger(reportQuantity)) {
      errors.push({
        line,
        sku,
        message: `Quantidade fracionada (${reportQuantity}): o sistema controla peças inteiras.`,
      });
      return;
    }
    if (reportQuantity < 0) {
      warnings.push({
        line,
        sku,
        message: `Saldo negativo no relatório (${reportQuantity}): entra como 0. Confira na contagem e ajuste pelo inventário.`,
      });
    }

    const unitPrice = numberCell(get(row, 'unitPrice'));
    const value = numberCell(get(row, 'value'));
    const cost = numberCell(get(row, 'cost'));
    let salePrice: number | null = null;
    if (unitPrice !== null && !Number.isNaN(unitPrice)) {
      salePrice = round(unitPrice, 2);
    } else if (value !== null && !Number.isNaN(value) && reportQuantity !== 0) {
      salePrice = round(value / reportQuantity, 2);
    }
    const unitCost =
      cost !== null && !Number.isNaN(cost) && reportQuantity > 0
        ? round(cost / reportQuantity, 4)
        : null;

    const supplier = clean(get(row, 'supplier')) || null;
    const fitRaw = clean(get(row, 'fit')).toUpperCase();
    parsed.push({
      line,
      sku,
      size,
      color,
      reportQuantity,
      quantity: Math.max(reportQuantity, 0),
      salePrice,
      unitCost,
      reference: sku.length > 6 ? sku.slice(0, -6) : sku,
      name,
      category,
      supplier,
      collection,
      fit: EMPTY_FIT.has(unaccent(fitRaw)) ? null : fitRaw,
    });
  });

  // SKUs repetidos no próprio relatório.
  const seenSku = new Map<string, number>();
  for (const row of parsed) {
    const previous = seenSku.get(row.sku);
    if (previous !== undefined) {
      errors.push({
        line: row.line,
        sku: row.sku,
        message: `SKU repetido (também na linha ${previous}).`,
      });
    } else {
      seenSku.set(row.sku, row.line);
    }
  }

  // Agrupa por referência (modelo).
  const groups = new Map<string, Parsed[]>();
  for (const row of parsed) {
    const list = groups.get(row.reference) ?? [];
    list.push(row);
    groups.set(row.reference, list);
  }

  const models: ErpModel[] = [];
  for (const [reference, list] of groups) {
    const names = new Set(list.map((r) => r.name));
    if (names.size > 1) {
      errors.push({
        line: list[0].line,
        message: `Referência ${reference} aparece com descrições diferentes: ${[...names].join(' | ')}.`,
      });
      continue;
    }
    const combos = new Map<string, number>();
    for (const row of list) {
      const key = `${row.size}|${row.color}`;
      const previous = combos.get(key);
      if (previous !== undefined) {
        errors.push({
          line: row.line,
          sku: row.sku,
          message: `Referência ${reference} já tem ${row.size || 'tamanho único'} / ${row.color || 'sem cor'} (linha ${previous}), depois de padronizar tamanho e cor.`,
        });
      } else {
        combos.set(key, row.line);
      }
    }
    const prices = list
      .map((r) => r.salePrice)
      .filter((p): p is number => p !== null);
    const modelPrice = mode(prices) ?? 0;
    const first = (values: (string | null)[]) =>
      values.find((v) => v !== null && v !== '') ?? null;
    models.push({
      reference,
      name: list[0].name,
      category: list[0].category,
      supplier: first(list.map((r) => r.supplier)),
      collection: first(list.map((r) => r.collection)),
      fit: first(list.map((r) => r.fit)),
      salePrice: modelPrice,
      variants: list.map((row) => ({
        line: row.line,
        sku: row.sku,
        size: row.size,
        color: row.color,
        reportQuantity: row.reportQuantity,
        quantity: row.quantity,
        salePrice: row.salePrice,
        unitCost: row.unitCost,
        priceOverride:
          row.salePrice !== null && row.salePrice !== modelPrice
            ? row.salePrice
            : null,
      })),
    });
  }

  const sum = parsed.reduce((total, row) => total + row.reportQuantity, 0);
  if (reportTotal !== null && reportTotal !== sum) {
    warnings.push({
      message: `A soma das linhas (${sum}) não bate com o TOTAL GERAL do relatório (${reportTotal}).`,
    });
  }
  if (parsed.length === 0 && errors.length === 0) {
    errors.push({
      message: 'Nenhuma linha de produto encontrada no relatório.',
    });
  }

  return {
    fileHash: createHash('sha256').update(buffer).digest('hex'),
    reportDate,
    store,
    columns: (Object.keys(column) as Column[])
      .filter((key) => column[key] >= 0)
      .map((key) => LABELS[key]),
    models,
    rowCount: parsed.length,
    reportTotal,
    normalizations: [...counts.values()].sort((a, b) => b.count - a.count),
    warnings,
    errors,
  };
}
