import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

// Checagem otimista: sem o cookie de sessão, nem tenta renderizar a página.
// A validação de verdade (token válido, usuário ativo, papel) é feita pela
// API em cada chamada; um token inválido também leva ao login (ver lib/api.ts).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("session");
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  return NextResponse.next();
}

// Fora do proxy: arquivos do Next e os do app instalável. O navegador busca o
// manifest, os ícones e o service worker sem o cookie de login; se fossem
// redirecionados para /login, a instalação do app falharia. O logo (brand/)
// aparece na própria tela de login.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|manifest.webmanifest|sw.js|offline.html|icons/|brand/|icon.png|apple-icon.png).*)",
  ],
};
