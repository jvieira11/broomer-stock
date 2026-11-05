import { PurchaseOrderStatus, type Prisma } from '../generated/prisma/client';

// Pedidos nestes status ainda esperam mercadoria (contam como "a caminho"
// nas sugestões e aceitam recebimento).
export const RECEIVABLE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.PENDING,
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

// Só rascunho e pendente podem ser editados.
export const EDITABLE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.PENDING,
];

export const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING: 'Pendente',
  SENT: 'Enviado ao fornecedor',
  PARTIALLY_RECEIVED: 'Parcialmente recebido',
  RECEIVED: 'Recebido',
  CANCELLED: 'Cancelado',
};

// Mudanças de status que o usuário pede (recebimento muda o status sozinho).
export const TRANSITIONS: Partial<
  Record<PurchaseOrderStatus, PurchaseOrderStatus[]>
> = {
  DRAFT: [PurchaseOrderStatus.PENDING, PurchaseOrderStatus.CANCELLED],
  PENDING: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.CANCELLED],
  SENT: [PurchaseOrderStatus.CANCELLED],
};

// Status de um pedido já liberado, a partir do que foi recebido.
export function receiptStatus(
  items: { quantityOrdered: number; quantityReceived: number }[],
  sentAt: Date | null,
): PurchaseOrderStatus {
  const received = items.reduce((sum, i) => sum + i.quantityReceived, 0);
  if (
    items.length > 0 &&
    items.every((i) => i.quantityReceived >= i.quantityOrdered)
  ) {
    return PurchaseOrderStatus.RECEIVED;
  }
  if (received > 0) return PurchaseOrderStatus.PARTIALLY_RECEIVED;
  return sentAt ? PurchaseOrderStatus.SENT : PurchaseOrderStatus.PENDING;
}

// Recalcula o status depois de um recebimento ou do estorno dele.
export async function syncReceiptStatus(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      sentAt: true,
      items: { select: { quantityOrdered: true, quantityReceived: true } },
    },
  });
  const status = receiptStatus(order.items, order.sentAt);
  await tx.purchaseOrder.update({ where: { id: orderId }, data: { status } });
  return status;
}
