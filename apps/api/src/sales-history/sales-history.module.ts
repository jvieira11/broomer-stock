import { Module } from '@nestjs/common';
import { SalesHistoryController } from './sales-history.controller';
import { SalesHistoryService } from './sales-history.service';

@Module({
  controllers: [SalesHistoryController],
  providers: [SalesHistoryService],
})
export class SalesHistoryModule {}
