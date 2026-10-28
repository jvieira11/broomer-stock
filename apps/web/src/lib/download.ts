import "server-only";
import { apiRaw } from "./api";

// Repassa um arquivo da API ao navegador sem carregá-lo inteiro na memória.
export async function proxyDownload(path: string) {
  const res = await apiRaw(path);
  if (!res.ok || !res.body) {
    return new Response("Não foi possível gerar o arquivo.", {
      status: res.status === 403 ? 403 : 502,
    });
  }

  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of ["Content-Type", "Content-Disposition"]) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(res.body, { headers });
}
