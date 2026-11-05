import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

// Profundidade máxima aceita em corpos e consultas (os formulários usam 3).
const MAX_DEPTH = 20;

// Roda antes da validação. Recusa com 400 o que antes virava erro 500:
// - o caractere nulo (\u0000), que o Postgres não aceita em texto;
// - JSON com milhares de níveis, que estoura a pilha do validador.
@Injectable()
export class SanitizeInputPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'custom') check(value, 0);
    return value;
  }
}

function check(value: unknown, depth: number): void {
  if (depth > MAX_DEPTH) {
    throw new BadRequestException('Os dados enviados têm níveis demais');
  }
  if (typeof value === 'string') {
    if (value.includes('\u0000')) {
      throw new BadRequestException(
        'O texto contém um caractere inválido (nulo)',
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) check(item, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) check(item, depth + 1);
  }
}
