import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  // Categoria desativada some dos formulários, mas continua nos produtos.
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
