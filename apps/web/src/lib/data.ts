import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { api, ApiError } from "./api";
import type { Me, Operation, ProductDetail } from "./types";

// Usuário logado. `cache` faz o layout e a página compartilharem a mesma
// chamada dentro de uma requisição.
export const getMe = cache(() => api.get<Me>("/auth/me"));

// Mostra a página 404 se o registro não existir (ou o id for inválido).
async function orNotFound<T>(path: string) {
  try {
    return await api.get<T>(path);
  } catch (error) {
    if (error instanceof ApiError && [400, 404].includes(error.status)) {
      notFound();
    }
    throw error;
  }
}

export const getProductOr404 = (id: string) =>
  orNotFound<ProductDetail>(`/products/${id}`);

export const getOperationOr404 = (id: string) =>
  orNotFound<Operation>(`/operations/${id}`);

// Monta a query string da API a partir dos parâmetros da página, só com os
// filtros conhecidos e não vazios.
export function pickQuery(
  params: Record<string, string | string[] | undefined>,
  keys: readonly string[],
) {
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.trim() !== "") {
      query.set(key, value.trim());
    }
  }
  return query;
}
