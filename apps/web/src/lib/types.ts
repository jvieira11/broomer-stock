export type Role = "ADMIN" | "MANAGER" | "OPERATOR" | "VIEWER";
export type MovementType = "IN" | "OUT" | "ADJUSTMENT";
export type OperationType =
  | "ENTRY"
  | "SALE"
  | "CUSTOMER_RETURN"
  | "SUPPLIER_RETURN"
  | "LOSS"
  | "INVENTORY"
  | "REVERSAL"
  | "INITIAL_LOAD";
export type StockStatus = "OUT" | "LOW" | "NORMAL";

// Valores decimais (dinheiro, custo) chegam da API como texto ("2.5") para
// não perder precisão. Quantidades de peças são inteiras.
type DecimalString = string;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  organization: { id: string; name: string };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  _count?: { products: number };
}

export interface Supplier {
  id: string;
  name: string;
}

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  size: string;
  color: string;
  salePrice: DecimalString | null;
  minQuantity: number | null;
  quantity: number;
  averageCost: DecimalString;
  active: boolean;
  status: StockStatus;
}

export interface Product {
  id: string;
  reference: string;
  name: string;
  description: string | null;
  collection: string | null;
  fit: string | null;
  salePrice: DecimalString;
  minQuantity: number;
  active: boolean;
  categoryId: string | null;
  category: { id: string; name: string; active?: boolean } | null;
  supplier: Supplier | null;
  createdAt: string;
}

export interface ProductDetail extends Product {
  variants: Variant[];
}

export interface ProductListItem extends Product {
  variantCount: number;
  totalQuantity: number;
  lowCount: number;
  outCount: number;
}

// Linha da consulta de estoque (uma por variação).
export interface StockItem {
  id: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  minQuantity: number;
  salePrice: DecimalString;
  averageCost: DecimalString;
  active: boolean;
  status: StockStatus;
  lastMovementAt: string | null;
  product: {
    id: string;
    reference: string;
    name: string;
    active: boolean;
    category: { id: string; name: string } | null;
  };
}

export interface VariantSummary {
  id: string;
  sku: string;
  size: string;
  color: string;
  product: { id: string; reference: string; name: string };
}

export interface OperationMovement {
  id: string;
  variantId: string;
  type: MovementType;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCost: DecimalString;
  variant: VariantSummary;
}

export interface OperationSummary {
  id: string;
  number: number;
  type: OperationType;
  occurredAt: string;
  createdAt: string;
  saleReference: string | null;
  origin: string | null;
  reason: string | null;
  notes: string | null;
  user: { id: string; name: string };
  reversal: { id: string; number: number } | null;
  _count?: { movements: number };
}

export interface Operation extends OperationSummary {
  purchaseOrder?: { id: string; number: number } | null;
  movements: OperationMovement[];
  reversedOperation: { id: string; number: number; type: OperationType } | null;
}

export interface Movement {
  id: string;
  type: MovementType;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCost: DecimalString;
  createdAt: string;
  variant: VariantSummary;
  user: { id: string; name: string };
  operation: {
    id: string;
    number: number;
    type: OperationType;
    occurredAt: string;
    saleReference: string | null;
    origin: string | null;
    reason: string | null;
    notes: string | null;
  };
}

export interface DashboardSummary {
  period: { from: string; to: string };
  activeProducts: number;
  activeVariants: number;
  categories: number;
  totalPieces: number;
  lowStockCount: number;
  outOfStockCount: number;
  stockCostValue: DecimalString;
  stockSaleValue: DecimalString;
  entries: number;
  sales: number;
  saleOperations: number;
  otherOutputs: number;
  reversals: number;
  daily: { day: string; in: number; out: number }[];
  topProducts: { id: string; reference: string; name: string; sold: number }[];
  lowStock: {
    id: string;
    sku: string;
    size: string;
    color: string;
    quantity: number;
    minQuantity: number;
    status: StockStatus;
    product: { id: string; name: string };
  }[];
  recentOperations: OperationSummary[];
}

// Estado devolvido pelas Server Actions aos formulários.
export interface FormState {
  error?: string;
  success?: string;
}

export interface Organization {
  id: string;
  name: string;
  cnpj: string | null;
  createdAt: string;
}

// ---------- Compras ----------

export type Classification =
  | "CRITICAL"
  | "REPLENISH"
  | "BELOW_MIN"
  | "STALE"
  | "EXCESS"
  | "INSUFFICIENT"
  | "OK";

export type PurchaseStatus =
  | "DRAFT"
  | "PENDING"
  | "SENT"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export interface PurchaseParams {
  analysisDays: number;
  leadTimeDays: number;
  coverDays: number;
  minSales: number;
  minHistoryDays: number;
  excessDays: number;
}

export interface SuggestionRow {
  variantId: string;
  sku: string;
  size: string;
  color: string;
  product: { id: string; reference: string; name: string };
  category: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  quantity: number;
  minQuantity: number;
  sold: number;
  onOrder: number;
  averageCost: DecimalString;
  classification: Classification;
  suggested: number | null;
  minShortfall: number | null;
  reliable: boolean;
  dailyRate: number | null;
  coverageDays: number | null;
  observedDays: number;
  reason: string;
}

export interface SuggestionsPage extends Page<SuggestionRow> {
  params: PurchaseParams;
  counts: Record<Classification, number>;
  totalSuggested: number;
  truncated: boolean;
}

export interface PurchaseOrderListItem {
  id: string;
  number: number;
  status: PurchaseStatus;
  notes: string | null;
  expectedAt: string | null;
  createdAt: string;
  supplier: { id: string; name: string } | null;
  user: { id: string; name: string };
  itemCount: number;
  piecesOrdered: number;
  piecesReceived: number;
}

export interface PurchaseOrderItem {
  id: string;
  variantId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: DecimalString | null;
  variant: VariantSummary & { quantity: number };
}

export interface PurchaseOrder {
  id: string;
  number: number;
  status: PurchaseStatus;
  notes: string | null;
  expectedAt: string | null;
  createdAt: string;
  sentAt: string | null;
  cancelledAt: string | null;
  supplier: { id: string; name: string } | null;
  user: { id: string; name: string };
  items: PurchaseOrderItem[];
  receipts: {
    id: string;
    number: number;
    occurredAt: string;
    user: { id: string; name: string };
    reversal: { id: string; number: number } | null;
    _count: { movements: number };
  }[];
}

export interface PurchaseSummary {
  params: PurchaseParams;
  truncated: boolean;
  counts: Record<Classification, number>;
  totalSuggested: number;
  estimatedCost: DecimalString;
  suggestedWithoutCost: number;
  needReplenish: number;
  topNeed: { id: string; name: string; suggested: number; variants: number }[];
  topSold: { id: string; name: string; sold: number; stock: number }[];
  topStale: { id: string; name: string; pieces: number }[];
  ordersByStatus: Partial<Record<PurchaseStatus, number>>;
  awaitingPieces: number;
  openOrders: (Omit<PurchaseOrderListItem, "itemCount" | "piecesOrdered" | "piecesReceived" | "user"> & {
    piecesPending: number;
  })[];
  recentEntries: {
    id: string;
    number: number;
    occurredAt: string;
    origin: string | null;
    pieces: number;
    user: { id: string; name: string };
    purchaseOrder: { id: string; number: number } | null;
    reversal: { id: string; number: number } | null;
  }[];
}
