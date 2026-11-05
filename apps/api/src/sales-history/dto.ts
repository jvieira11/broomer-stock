import {
  IsHexadecimal,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class ConfirmSalesImportDto {
  @IsHexadecimal()
  @Length(64, 64)
  fileHash: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SalesSummaryQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'Data inicial inválida (use AAAA-MM-DD)' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'Data final inválida (use AAAA-MM-DD)' })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;
}
