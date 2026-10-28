import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../generated/prisma/client';
import { AuthUser } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

// Rota acessível sem login.
export const Public = () => SetMetadata(IS_PUBLIC, true);

// Papéis que podem acessar a rota.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);

// Atalhos para os grupos de papéis mais usados.
export const CAN_EDIT_CATALOG: Role[] = [Role.ADMIN, Role.MANAGER];
export const CAN_MOVE_STOCK: Role[] = [Role.ADMIN, Role.MANAGER, Role.OPERATOR];
// Perdas, devoluções, inventário e estornos: mudam o saldo por decisão.
export const CAN_ADJUST_STOCK: Role[] = [Role.ADMIN, Role.MANAGER];
