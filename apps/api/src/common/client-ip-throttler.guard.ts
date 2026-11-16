import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CLIENT_IP_HEADER } from './internal-key.guard';

// IPv4 ou IPv6 (só caracteres de endereço, tamanho limitado).
const IP_SHAPE = /^[0-9a-fA-F:.]{3,45}$/;

// Limite de tentativas por IP. Quando o servidor do site está na frente da
// API, o IP que a API enxerga é o dele; com a chave interna ligada, o IP do
// usuário final vem no cabeçalho X-Client-IP e o limite vale por pessoa.
// O cabeçalho só é considerado se a chave interna estiver ligada (o
// InternalKeyGuard, que roda antes, já confirmou que quem chama é o site):
// sem isso, qualquer um poderia trocar de "IP" a cada tentativa.
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, unknown>;
    const forwarded = headers[CLIENT_IP_HEADER];
    if (
      process.env.INTERNAL_API_KEY &&
      typeof forwarded === 'string' &&
      IP_SHAPE.test(forwarded)
    ) {
      return Promise.resolve(forwarded);
    }
    return Promise.resolve(String(req.ip ?? ''));
  }
}
