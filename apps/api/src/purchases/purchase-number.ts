import { Prisma } from '../generated/prisma/client';

// Próximo número de pedido da loja, sem buracos (mesma ideia do número das
// operações): a trava dura até o fim da transação.
export async function nextPurchaseNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('purchase_orders.number'))`;
  const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
    SELECT (COALESCE(MAX(number), 0) + 1)::int AS next
    FROM purchase_orders WHERE organization_id = ${organizationId}`;
  return next;
}
