import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getToken } from "./session";

const API_URL = process.env.API_URL ?? "http://localhost:3333/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

// Quem chama a API é o servidor do Next, não o navegador. Repassamos o IP do
// usuário (vindo do proxy) para o limite de tentativas de login da API valer
// por pessoa, e não para todos de uma vez.
async function clientIpHeader(): Promise<Record<string, string>> {
  const forwardedFor = (await headers()).get("x-forwarded-for");
  return forwardedFor ? { "X-Forwarded-For": forwardedFor } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Os dados mudam a cada movimentação: nada de prerender nem cache.
  await connection();
  const token = await getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(await clientIpHeader()),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init?.headers,
    },
  });

  // Sessão expirada, usuário desativado ou sem login: volta para o login.
  if (res.status === 401) {
    redirect("/login?expired=1");
  }
  if (res.status === 204) {
    return undefined as T;
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body as { code?: string } | null)?.code;
    throw new ApiError(errorMessage(body), res.status, code);
  }
  return body as T;
}

// A API responde { message: string | string[] } nos erros.
function errorMessage(body: unknown) {
  const message = (body as { message?: string | string[] } | null)?.message;
  if (Array.isArray(message)) return message.join("; ");
  return message ?? "Erro inesperado na API";
}

// Para downloads e upload de arquivos: devolve a resposta sem ler o corpo.
export async function apiRaw(path: string, init?: RequestInit) {
  await connection();
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(await clientIpHeader()),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    redirect("/login?expired=1");
  }
  return res;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
};

// Login e cadastro: chamam a API sem token e devolvem o erro em vez de
// redirecionar (um 401 aqui é "senha errada", não "sessão expirada").
export async function publicPost<T>(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(await clientIpHeader()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(errorMessage(data), res.status);
  }
  return data as T;
}
