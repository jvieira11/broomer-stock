import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { fmt, MAX_MONEY, MAX_QUANTITY } from '../../common/limits';
import { PageQueryDto, toBoolean } from '../../common/query';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Tamanho e cor em maiúsculas e sem espaços duplicados, como no ERP: evita
// "58M" x "58 m" x "58  M" virarem filtros diferentes. "" = não se aplica.
export const normalizeAttribute = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').toUpperCase()
    : value;

// Texto opcional: "" vira null (limpa o campo na edição).
const optionalText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export const MAX_VARIANTS = 200;

// Quantidade e custo médio não entram aqui: mudam só por movimentações.
export class CreateVariantDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe o SKU/código da variação' })
  @MaxLength(50)
  @Matches(/^\S+$/, { message: 'O SKU não pode ter espaços' })
  sku: string;

  @IsOptional()
  @Transform(normalizeAttribute)
  @IsString()
  @MaxLength(30)
  size?: string;

  @IsOptional()
  @Transform(normalizeAttribute)
  @IsString()
  @MaxLength(60)
  color?: string;

  // null = usa o preço do modelo.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY, { message: `O preço máximo é R$ ${fmt(MAX_MONEY)}` })
  salePrice?: number | null;

  // null = usa o mínimo do modelo.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY, {
    message: `O estoque mínimo máximo é ${fmt(MAX_QUANTITY)}`,
  })
  minQuantity?: number | null;
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe a referência do modelo' })
  @MaxLength(30)
  reference: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome do produto' })
  @MaxLength(150)
  name: string;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(60)
  collection?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(60)
  fit?: string | null;

  // Nome do fornecedor; é cadastrado se ainda não existir.
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(150)
  supplierName?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Preço de venda inválido' })
  @Min(0)
  @Max(MAX_MONEY, { message: `O preço máximo é R$ ${fmt(MAX_MONEY)}` })
  salePrice?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt({ message: 'Estoque mínimo inválido' })
  @Min(0)
  @Max(MAX_QUANTITY, {
    message: `O estoque mínimo máximo é ${fmt(MAX_QUANTITY)}`,
  })
  minQuantity?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // null remove o produto da categoria (só na edição).
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_VARIANTS)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}

export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['variants'] as const),
) {}

export class QueryProductDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;
}

export const STOCK_STATUSES = ['OUT', 'LOW', 'NORMAL'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export class QueryVariantDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Transform(normalizeAttribute)
  @IsString()
  @MaxLength(30)
  size?: string;

  @IsOptional()
  @Transform(normalizeAttribute)
  @IsString()
  @MaxLength(60)
  color?: string;

  @IsOptional()
  @IsIn(STOCK_STATUSES)
  status?: StockStatus;

  // Padrão: só variações ativas de produtos ativos.
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active: boolean = true;

  @IsOptional()
  @IsIn(['name', 'quantity', 'recent'])
  sort: 'name' | 'quantity' | 'recent' = 'name';
}
