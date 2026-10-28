import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { toBoolean } from '../../common/query';

export class QueryCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;
}
