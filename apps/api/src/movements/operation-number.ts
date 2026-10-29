import { Prisma } from '../generated/prisma/client';

// Próximo número de operação, sem buracos. Uma sequence do Postgres gasta o
// número mesmo quando a transação é desfeita (venda sem saldo, por exemplo),
// então o número é calculado aqui. A trava vale até o fim da transação: duas
// operações simultâneas esperam uma pela outra e não pegam o mesmo número.
// Chame só depois de validar e travar o resto, para segurar a trava pouco.
export async function nextOperationNumber(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('stock_operations.number'))`;
  const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
    SELECT (COALESCE(MAX(number), 0) + 1)::int AS next FROM stock_operations`;
  return next;
}
