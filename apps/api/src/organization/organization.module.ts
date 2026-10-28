import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService, ExportService],
})
export class OrganizationModule {}
