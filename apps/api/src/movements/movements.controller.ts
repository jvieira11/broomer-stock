import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import {
  CAN_ADJUST_STOCK,
  CAN_MOVE_STOCK,
  CurrentUser,
  Roles,
} from '../auth/decorators';
import {
  CreateOperationDto,
  QueryMovementDto,
  QueryOperationDto,
  ReverseOperationDto,
} from './dto/operation.dto';
import { OperationsService } from './operations.service';

// Operações agrupam os itens registrados juntos (uma venda com várias peças).
// Os tipos permitidos a cada papel são conferidos no serviço.
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryOperationDto) {
    return this.operations.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.findOne(user, id);
  }

  @Post()
  @Roles(...CAN_MOVE_STOCK)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOperationDto) {
    return this.operations.create(user, dto);
  }

  @Post(':id/reverse')
  @Roles(...CAN_ADJUST_STOCK)
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseOperationDto,
  ) {
    return this.operations.reverse(user, id, dto);
  }
}

// Histórico item a item (uma linha por variação movimentada).
@Controller('movements')
export class MovementsController {
  constructor(private readonly operations: OperationsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryMovementDto) {
    return this.operations.findMovements(user, query);
  }
}
