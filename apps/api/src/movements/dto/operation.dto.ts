import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OperationType } from '../../generated/prisma/client';
import { fmt, MAX_MONEY, MAX_QUANTITY } from '../../common/limits';
import { PeriodQueryDto } from '../../common/query';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

// Tipos que podem ser registrados pela tela. Estorno tem rota própria e a
// carga inicial é exclusiva da importação.
export const REGISTRABLE_TYPES = [
  OperationType.ENTRY,
  OperationType.SALE,
  OperationType.CUSTOMER_RETURN,
  OperationType.SUPPLIER_RETURN,
  OperationType.LOSS,
  OperationType.INVENTORY,
] as const;

export const MAX_ITEMS = 200;

export class OperationItemDto {
  @IsUUID('4', { message: 'Variação inválida' })
  variantId: string;

  // Entradas e saídas: peças movimentadas (maior que 0, checado nas regras).
  // Ajuste de inventário: a contagem real (pode ser 0).
  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(0)
  @Max(MAX_QUANTITY, {
    message: `A quantidade máxima por item é ${fmt(MAX_QUANTITY)}`,
  })
  quantity: number;

  // Só em entradas: custo pago por peça. Sem ele, usa o custo médio atual.
  // null não é aceito: ou o custo vem, ou o campo é omitido.
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Custo unitário inválido' })
  @Min(0)
  @Max(MAX_MONEY, {
    message: `O custo unitário máximo é R$ ${fmt(MAX_MONEY)}`,
  })
  unitCost?: number;
}

export class CreateOperationDto {
  @IsIn(REGISTRABLE_TYPES, { message: 'Tipo de operação inválido' })
  type: (typeof REGISTRABLE_TYPES)[number];

  // Quando aconteceu. Padrão: agora.
  @IsOptional()
  @IsDateString({}, { message: 'Data da operação inválida' })
  occurredAt?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  saleReference?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  origin?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Gerada pelo formulário; reenviar o mesmo envio devolve a operação já gravada.
  @IsOptional()
  @IsString()
  @Length(8, 100)
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Inclua pelo menos um item' })
  @ArrayMaxSize(MAX_ITEMS, { message: `Máximo de ${MAX_ITEMS} itens` })
  @ValidateNested({ each: true })
  @Type(() => OperationItemDto)
  items: OperationItemDto[];
}

export class ReverseOperationDto {
  @Transform(trim)
  @IsString({ message: 'Informe o motivo do estorno' })
  @Length(3, 255, { message: 'Informe o motivo do estorno' })
  reason: string;

  @IsOptional()
  @IsString()
  @Length(8, 100)
  idempotencyKey?: string;
}

export class QueryOperationDto extends PeriodQueryDto {
  @IsOptional()
  @IsEnum(OperationType)
  type?: OperationType;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class QueryMovementDto extends QueryOperationDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  size?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  color?: string;
}
