import { Module } from '@nestjs/common';
import {
  ProductsController,
  SuppliersController,
  VariantsController,
} from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController, VariantsController, SuppliersController],
  providers: [ProductsService],
})
export class ProductsModule {}
