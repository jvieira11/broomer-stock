import { Role } from '../generated/prisma/client';

// Usuário autenticado, anexado à requisição pelo JwtAuthGuard.
export interface AuthUser {
  id: string;
  organizationId: string;
  role: Role;
  name: string;
  email: string;
}

export interface JwtPayload {
  sub: string;
  // Versão da sessão do usuário quando o token foi emitido (ausente = 0).
  ver?: number;
}
