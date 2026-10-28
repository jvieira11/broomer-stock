import { Module } from '@nestjs/common';
import {
  MovementsController,
  OperationsController,
} from './movements.controller';
import { OperationsService } from './operations.service';

@Module({
  controllers: [OperationsController, MovementsController],
  providers: [OperationsService],
})
export class MovementsModule {}
