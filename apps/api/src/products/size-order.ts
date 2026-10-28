import { Prisma } from '../generated/prisma/client';

// Grade de letras na ordem de vestir (do relatório do ERP da Broomer).
// Tamanhos numéricos (38, 40, "48 M", "37/38") vêm depois, pelo número;
// o resto (DV, sem tamanho...) por último, em ordem alfabética.
const LETTERS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EGG'];

export function sizeRank(size: string): number {
  const letter = LETTERS.indexOf(size);
  if (letter >= 0) return letter;
  const number = /^\d+/.exec(size);
  if (number) return 100 + Number(number[0]);
  return 10_000;
}

export function compareSizes(a: string, b: string) {
  return sizeRank(a) - sizeRank(b) || a.localeCompare(b, 'pt-BR');
}

// A mesma ordem em SQL, para as listagens paginadas no banco.
export const SIZE_ORDER = Prisma.sql`
  CASE
    WHEN v.size = ANY(${LETTERS}::text[]) THEN array_position(${LETTERS}::text[], v.size)
    WHEN v.size ~ '^[0-9]+' THEN 100 + substring(v.size from '^[0-9]+')::int
    ELSE 10000
  END, v.size`;
