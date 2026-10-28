import type { OperationType, Role } from "./types";

// Espelha as regras da API, só para mostrar ou esconder botões.
// Quem garante a permissão de verdade é a API.
export const canEditCatalog = (role: Role) =>
  role === "ADMIN" || role === "MANAGER";

export const canMoveStock = (role: Role) => role !== "VIEWER";

// Perdas, devoluções, inventário e estornos.
export const canAdjustStock = (role: Role) =>
  role === "ADMIN" || role === "MANAGER";

export const canManageUsers = (role: Role) => role === "ADMIN";

// Tipos de operação que cada papel pode registrar.
export function allowedOperations(role: Role): OperationType[] {
  if (canAdjustStock(role)) {
    return [
      "SALE",
      "ENTRY",
      "CUSTOMER_RETURN",
      "SUPPLIER_RETURN",
      "LOSS",
      "INVENTORY",
    ];
  }
  return canMoveStock(role) ? ["SALE", "ENTRY"] : [];
}

export const roleLabels: Record<Role, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  OPERATOR: "Operador",
  VIEWER: "Consulta",
};

export const roleDescriptions: Record<Role, string> = {
  ADMIN: "Tudo, inclusive usuários, ajustes e estornos",
  MANAGER: "Cadastros, movimentações, ajustes e estornos",
  OPERATOR: "Entradas e vendas; consulta estoque e histórico",
  VIEWER: "Só consulta",
};
