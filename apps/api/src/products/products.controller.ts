import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CAN_EDIT_CATALOG, CurrentUser, Roles } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  CreateVariantDto,
  QueryProductDto,
  QueryVariantDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/create-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryProductDto) {
    return this.productsService.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.findOne(user, id);
  }

  @Post()
  @Roles(...CAN_EDIT_CATALOG)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user, dto);
  }

  @Patch(':id')
  @Roles(...CAN_EDIT_CATALOG)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(...CAN_EDIT_CATALOG)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.remove(user, id);
  }

  @Post(':id/variants')
  @Roles(...CAN_EDIT_CATALOG)
  addVariant(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.addVariant(user, id, dto);
  }
}

// Variações (SKUs): consulta de estoque e edição. Devolvem o produto inteiro
// nas alterações, para a tela redesenhar a grade.
@Controller('variants')
export class VariantsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryVariantDto) {
    return this.productsService.findVariants(user, query);
  }

  @Get('attributes')
  attributes(@CurrentUser() user: AuthUser) {
    return this.productsService.attributes(user);
  }

  @Patch(':id')
  @Roles(...CAN_EDIT_CATALOG)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(user, id, dto);
  }

  @Delete(':id')
  @Roles(...CAN_EDIT_CATALOG)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.removeVariant(user, id);
  }
}

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.prisma.supplier.findMany({
      where: { organizationId: user.organizationId, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
