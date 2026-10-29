import { Module } from '@nestjs/common';
import { ImportController } from './import/import.controller';
import { ImportService } from './import/import.service';
import {
  ProductsController,
  SuppliersController,
  VariantsController,
} from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [
    ImportController,
    ProductsController,
    VariantsController,
    SuppliersController,
  ],
  providers: [ProductsService, ImportService],
})
export class ProductsModule {}
