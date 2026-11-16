import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const INTERNAL_KEY_HEADER = 'x-internal-key';
// IP do usuário final, repassado pelo servidor do site (BFF). Só vale quando a
// chave interna chegou correta (ver ClientIpThrottlerGuard).
export const CLIENT_IP_HEADER = 'x-client-ip';

// Monitores e o Docker precisam chamar estas rotas sem a chave.
const OPEN_PATHS = /^\/api\/health(\/live)?\/?$/;

const digest = (value: string) => createHash('sha256').update(value).digest();

// Chave de acesso entre o servidor do site e a API. Com INTERNAL_API_KEY
// definida, toda chamada sem o cabeçalho X-Internal-Key correto é recusada
// (exceto /api/health): quem descobrir o endereço público da API não consegue
// nem tentar senhas direto nela. Sem a variável, não faz nada (compatível
// com quem ainda não ligou o recurso). Lida a cada chamada, não ao iniciar.
@Injectable()
export class InternalKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (OPEN_PATHS.test(request.path)) return true;

    const sent = request.headers[INTERNAL_KEY_HEADER];
    if (
      typeof sent === 'string' &&
      timingSafeEqual(digest(sent), digest(expected))
    ) {
      return true;
    }
    throw new ForbiddenException('Acesso negado');
  }
}
