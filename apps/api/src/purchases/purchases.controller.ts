import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import {
  CAN_EDIT_CATALOG,
  CAN_MOVE_STOCK,
  CurrentUser,
  Roles,
} from '../auth/decorators';
import {
  ChangeStatusDto,
  CreatePurchaseOrderDto,
  FromSuggestionsDto,
  QueryPurchaseOrderDto,
  QuerySuggestionDto,
  ReceivePurchaseOrderDto,
  SettingsDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase.dto';
import { PurchaseOrdersService } from './orders.service';
import { SuggestionsService } from './suggestions.service';

// Dashboard, sugestões e parâmetros do módulo de compras. Todos os papéis
// consultam; só administrador e gerente mudam os parâmetros.
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.suggestions.summary(user);
  }

  @Get('suggestions')
  list(@CurrentUser() user: AuthUser, @Query() query: QuerySuggestionDto) {
    return this.suggestions.suggestions(user, query);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.suggestions.getSettings(user);
  }

  @Put('settings')
  @Roles(...CAN_EDIT_CATALOG)
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: SettingsDto) {
    return this.suggestions.saveSettings(user, dto);
  }
}

// Criar, editar e mudar o status do pedido: administrador e gerente.
// Receber mercadoria (gera a entrada no estoque): quem pode registrar entradas.
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryPurchaseOrderDto,
  ) {
    return this.orders.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.findOne(user, id);
  }

  @Post()
  @Roles(...CAN_EDIT_CATALOG)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.orders.create(user, dto);
  }

  @Post('from-suggestions')
  @Roles(...CAN_EDIT_CATALOG)
  fromSuggestions(
    @CurrentUser() user: AuthUser,
    @Body() dto: FromSuggestionsDto,
  ) {
    return this.orders.createFromSuggestions(user, dto);
  }

  @Patch(':id')
  @Roles(...CAN_EDIT_CATALOG)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.orders.update(user, id, dto);
  }

  @Post(':id/status')
  @Roles(...CAN_EDIT_CATALOG)
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.orders.changeStatus(user, id, dto);
  }

  @Post(':id/receive')
  @Roles(...CAN_MOVE_STOCK)
  receive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.orders.receive(user, id, dto);
  }
}
