import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role } from '../generated/prisma/client';
import { AuthUser } from './auth.types';
import { IS_PUBLIC, ROLES } from './decorators';

// Seguro por padrão: leitura (GET) é liberada para qualquer usuário logado;
// toda rota que altera dados precisa declarar @Roles(...), senão é bloqueada.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthUser }>();
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES,
      targets,
    );

    if (!roles) {
      if (request.method === 'GET') return true;
      throw new ForbiddenException('Rota sem permissões definidas');
    }
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenException(
        'Seu usuário não tem permissão para esta ação',
      );
    }
    return true;
  }
}
