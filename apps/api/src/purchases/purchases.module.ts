import { Module } from '@nestjs/common';
import { MovementsModule } from '../movements/movements.module';
import { PurchaseOrdersService } from './orders.service';
import {
  PurchaseOrdersController,
  PurchasesController,
} from './purchases.controller';
import { SuggestionsService } from './suggestions.service';

@Module({
  imports: [MovementsModule],
  controllers: [PurchasesController, PurchaseOrdersController],
  providers: [PurchaseOrdersService, SuggestionsService],
})
export class PurchasesModule {}
