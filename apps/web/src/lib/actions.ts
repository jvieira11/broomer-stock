"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { api, ApiError, publicPost } from "./api";
import { clearSession, setSession } from "./session";
import type {
  FormState,
  Operation,
  OperationType,
  Organization,
  Page,
  ProductDetail,
  Role,
  StockItem,
} from "./types";

// Toda Server Action é um endpoint público (pode ser chamada por POST direto).
// A autorização de verdade fica na API, que recebe o token do cookie e
// confere a loja e o papel em cada chamada.

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(formData: FormData, name: string) {
  const value = text(formData, name);
  return value === "" ? undefined : Number(value.replace(",", "."));
}

function failure(error: unknown, duplicateMessage = ""): FormState {
  // Deixa passar o redirect para o login (sessão expirada) e o notFound.
  unstable_rethrow(error);
  if (error instanceof ApiError) {
    if (error.code === "P2002" && duplicateMessage) {
      return { error: duplicateMessage };
    }
    return { error: error.message };
  }
  return { error: "Não foi possível falar com a API. Ela está rodando?" };
}

function revalidateStock() {
  revalidatePath("/", "layout");
}

// ---------- Sessão ----------

interface SessionResponse {
  token: string;
}

export async function login(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { token } = await publicPost<SessionResponse>("/auth/login", {
      email: text(formData, "email"),
      password: formData.get("password"),
    });
    await setSession(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { error: "Muitas tentativas. Aguarde um minuto e tente de novo." };
    }
    return failure(error);
  }
  redirect("/dashboard");
}

const TOO_MANY = "Muitas tentativas. Aguarde um minuto e tente de novo.";

export async function forgotPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await publicPost("/auth/forgot-password", { email: text(formData, "email") });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { error: TOO_MANY };
    }
    return failure(error);
  }
  // A mesma resposta exista ou não a conta (a API também não revela).
  return {
    success:
      "Se este e-mail tiver conta, enviamos um link para criar uma senha nova. Confira a caixa de entrada e o spam.",
  };
}

export async function resetPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (formData.get("password") !== formData.get("confirmPassword")) {
    return { error: "As senhas não conferem." };
  }

  try {
    await publicPost("/auth/reset-password", {
      token: text(formData, "token"),
      password: formData.get("password"),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { error: TOO_MANY };
    }
    return failure(error);
  }
  redirect("/login?reset=1");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (formData.get("newPassword") !== formData.get("confirmPassword")) {
    return { error: "As senhas novas não conferem." };
  }

  try {
    const { token } = await api.patch<SessionResponse>("/auth/password", {
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
    });
    // Token novo: esta sessão continua, as dos outros aparelhos caem.
    await setSession(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { error: TOO_MANY };
    }
    return failure(error);
  }
  return {
    success: "Senha alterada. Os outros aparelhos precisarão entrar de novo.",
  };
}

// ---------- Loja ----------

export async function saveOrganization(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await api.patch<Organization>("/organization", {
      name: text(formData, "name"),
      cnpj: text(formData, "cnpj"),
    });
  } catch (error) {
    return failure(error);
  }

  // O nome da loja aparece em várias páginas.
  revalidatePath("/", "layout");
  return { success: "Dados da loja salvos." };
}

// ---------- Produtos e variações ----------

export interface VariantInput {
  sku: string;
  size?: string;
  color?: string;
  salePrice?: number | null;
  minQuantity?: number | null;
}

export async function saveProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "id");
  // Na edição, campo vazio limpa o valor; no cadastro, é omitido.
  const optional = (name: string) => text(formData, name) || (id ? null : undefined);

  const body: Record<string, unknown> = {
    reference: text(formData, "reference"),
    name: text(formData, "name"),
    description: optional("description"),
    collection: optional("collection"),
    fit: optional("fit"),
    supplierName: optional("supplierName"),
    categoryId: optional("categoryId"),
    salePrice: optionalNumber(formData, "salePrice"),
    minQuantity: optionalNumber(formData, "minQuantity"),
  };

  if (!id) {
    // A grade de variações vem do formulário como JSON.
    try {
      body.variants = JSON.parse(text(formData, "variants") || "[]") as VariantInput[];
    } catch {
      return { error: "Não foi possível ler as variações." };
    }
  }

  let saved: ProductDetail;
  try {
    saved = id
      ? await api.patch<ProductDetail>(`/products/${id}`, body)
      : await api.post<ProductDetail>("/products", body);
  } catch (error) {
    return failure(error);
  }

  revalidateStock();
  redirect(`/produtos/${saved.id}`);
}

export async function setProductActive(
  id: string,
  active: boolean,
): Promise<FormState> {
  try {
    await api.patch(`/products/${id}`, { active });
  } catch (error) {
    return failure(error);
  }
  revalidateStock();
  return { success: active ? "Produto reativado." : "Produto desativado." };
}

export async function deleteProduct(id: string): Promise<FormState> {
  try {
    await api.delete(`/products/${id}`);
  } catch (error) {
    return failure(error);
  }
  revalidateStock();
  redirect("/produtos");
}

export async function addVariant(
  productId: string,
  variant: VariantInput,
): Promise<FormState> {
  try {
    await api.post(`/products/${productId}/variants`, variant);
  } catch (error) {
    return failure(error);
  }
  revalidateStock();
  return { success: "Variação adicionada." };
}

export async function updateVariant(
  id: string,
  changes: Partial<VariantInput> & { active?: boolean },
): Promise<FormState> {
  try {
    await api.patch(`/variants/${id}`, changes);
  } catch (error) {
    return failure(error);
  }
  revalidateStock();
  return { success: "Variação atualizada." };
}

export async function removeVariant(id: string): Promise<FormState> {
  try {
    await api.delete(`/variants/${id}`);
  } catch (error) {
    return failure(error);
  }
  revalidateStock();
  return { success: "Variação excluída." };
}

// Busca de SKUs para o formulário de movimentação.
export async function searchVariants(search: string): Promise<StockItem[]> {
  const term = search.trim();
  if (term.length < 2) return [];
  try {
    const page = await api.get<Page<StockItem>>(
      `/variants?${new URLSearchParams({ search: term, pageSize: "20" })}`,
    );
    return page.items;
  } catch (error) {
    unstable_rethrow(error);
    return [];
  }
}

// ---------- Categorias ----------

export async function saveCategory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "id");
  const description = text(formData, "description");
  const body = {
    name: text(formData, "name"),
    description: description || undefined,
  };

  try {
    if (id) {
      await api.patch(`/categories/${id}`, body);
    } else {
      await api.post("/categories", body);
    }
  } catch (error) {
    return failure(error, "Já existe uma categoria com este nome.");
  }

  revalidateStock();
  return { success: id ? "Categoria atualizada." : "Categoria criada." };
}

export async function setCategoryActive(
  id: string,
  active: boolean,
): Promise<FormState> {
  try {
    await api.patch(`/categories/${id}`, { active });
  } catch (error) {
    return failure(error);
  }
  revalidateStock();
  return {};
}

export async function deleteCategory(id: string): Promise<FormState> {
  try {
    await api.delete(`/categories/${id}`);
  } catch (error) {
    return failure(error);
  }
  revalidateStock();
  return {};
}

// ---------- Movimentações ----------

export interface OperationInput {
  type: OperationType;
  occurredAt?: string;
  saleReference?: string;
  origin?: string;
  reason?: string;
  notes?: string;
  idempotencyKey: string;
  items: { variantId: string; quantity: number; unitCost?: number }[];
}

export type OperationResult =
  | { error: string }
  | { operation: Pick<Operation, "id" | "number" | "type"> };

export async function createOperation(
  input: OperationInput,
): Promise<OperationResult> {
  try {
    const operation = await api.post<Operation>("/operations", input);
    revalidateStock();
    return {
      operation: {
        id: operation.id,
        number: operation.number,
        type: operation.type,
      },
    };
  } catch (error) {
    return { error: failure(error).error ?? "Erro inesperado." };
  }
}

export async function reverseOperation(
  id: string,
  reason: string,
  idempotencyKey: string,
): Promise<FormState> {
  let reversal: Operation;
  try {
    reversal = await api.post<Operation>(`/operations/${id}/reverse`, {
      reason,
      idempotencyKey,
    });
  } catch (error) {
    return failure(error);
  }
  revalidateStock();
  redirect(`/movimentacoes/${reversal.id}`);
}

// ---------- Usuários ----------

export async function createUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await api.post("/users", {
      name: text(formData, "name"),
      email: text(formData, "email"),
      password: formData.get("password"),
      role: text(formData, "role") as Role,
    });
  } catch (error) {
    return failure(error);
  }

  revalidatePath("/usuarios");
  return { success: "Usuário criado. Passe o e-mail e a senha para a pessoa." };
}

export async function updateUser(
  id: string,
  changes: { role?: Role; active?: boolean; password?: string },
): Promise<FormState> {
  try {
    await api.patch(`/users/${id}`, changes);
  } catch (error) {
    return failure(error);
  }

  revalidatePath("/usuarios");
  return { success: "Usuário atualizado." };
}
