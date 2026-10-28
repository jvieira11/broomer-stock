import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from './auth.types';
import { IS_PUBLIC } from './decorators';

// Exige um token válido em todas as rotas, exceto as marcadas com @Public().
// O usuário é buscado no banco a cada requisição: desativar alguém ou mudar
// seu papel vale na hora, sem esperar o token expirar.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Faça login para continuar');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Sessão expirada. Faça login de novo');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        organizationId: true,
        role: true,
        name: true,
        email: true,
        active: true,
        sessionVersion: true,
      },
    });
    if (!user?.active) {
      throw new UnauthorizedException('Usuário inativo ou inexistente');
    }
    // A senha foi trocada depois que este token foi emitido.
    if ((payload.ver ?? 0) !== user.sessionVersion) {
      throw new UnauthorizedException('Sessão expirada. Faça login de novo');
    }

    request.user = {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
      name: user.name,
      email: user.email,
    };
    return true;
  }
}
