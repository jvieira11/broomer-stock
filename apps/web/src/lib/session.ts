import "server-only";
import { cookies } from "next/headers";

// O token da API fica num cookie httpOnly: o JavaScript da página não
// consegue lê-lo (proteção contra XSS). Só o servidor do Next o envia à API.
export const SESSION_COOKIE = "session";
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export async function getToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

// Só pode ser chamado em Server Actions (cookies não são gravados durante a renderização).
export async function setSession(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SEVEN_DAYS,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
