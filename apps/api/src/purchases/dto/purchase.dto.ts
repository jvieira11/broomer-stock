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
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { fmt, MAX_MONEY, MAX_QUANTITY } from '../../common/limits';
import { PageQueryDto, toBoolean } from '../../common/query';
import { PurchaseOrderStatus } from '../../generated/prisma/client';
import type { Classification } from '../suggestion-rules';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export const MAX_ORDER_ITEMS = 200;

export class PurchaseItemDto {
  @IsUUID('4', { message: 'Variação inválida' })
  variantId: string;

  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade deve ser maior que zero' })
  @Max(MAX_QUANTITY, {
    message: `A quantidade máxima por item é ${fmt(MAX_QUANTITY)}`,
  })
  quantity: number;

  // Custo combinado por peça; opcional.
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Custo unitário inválido' })
  @Min(0)
  @Max(MAX_MONEY, {
    message: `O custo unitário máximo é R$ ${fmt(MAX_MONEY)}`,
  })
  unitCost?: number;
}

class PurchaseFieldsDto {
  @IsOptional()
  @IsUUID('4', { message: 'Fornecedor inválido' })
  supplierId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Previsão de chegada (AAAA-MM-DD).
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Data prevista inválida' })
  expectedAt?: string;
}

export class CreatePurchaseOrderDto extends PurchaseFieldsDto {
  // Rascunho por padrão; "PENDING" já deixa o pedido pronto para enviar.
  @IsOptional()
  @IsIn([PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING])
  status?: 'DRAFT' | 'PENDING';

  @IsOptional()
  @IsUUID('4')
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Inclua ao menos um item' })
  @ArrayMaxSize(MAX_ORDER_ITEMS, {
    message: `Máximo de ${MAX_ORDER_ITEMS} itens por pedido`,
  })
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}

// Edição (só rascunho ou pendente). Os itens enviados substituem os atuais.
// Fornecedor, observações e previsão aceitam null para limpar o valor.
export class UpdatePurchaseOrderDto {
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsUUID('4', { message: 'Fornecedor inválido' })
  supplierId?: string | null;

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsDateString({ strict: true }, { message: 'Data prevista inválida' })
  expectedAt?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Inclua ao menos um item' })
  @ArrayMaxSize(MAX_ORDER_ITEMS, {
    message: `Máximo de ${MAX_ORDER_ITEMS} itens por pedido`,
  })
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items?: PurchaseItemDto[];
}

export class ChangeStatusDto {
  @IsIn([
    PurchaseOrderStatus.PENDING,
    PurchaseOrderStatus.SENT,
    PurchaseOrderStatus.CANCELLED,
  ])
  status: 'PENDING' | 'SENT' | 'CANCELLED';
}

export class ReceiveItemDto {
  @IsUUID('4', { message: 'Item inválido' })
  itemId: string;

  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade recebida deve ser maior que zero' })
  @Max(MAX_QUANTITY)
  quantity: number;

  // Custo real da peça neste recebimento; sem ele vale o custo do pedido.
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Custo unitário inválido' })
  @Min(0)
  @Max(MAX_MONEY)
  unitCost?: number;
}

export class ReceivePurchaseOrderDto {
  // Obrigatória: o mesmo envio repetido não recebe duas vezes.
  @IsUUID('4', { message: 'Chave de operação inválida' })
  idempotencyKey: string;

  @IsOptional()
  @IsDateString({}, { message: 'Data do recebimento inválida' })
  occurredAt?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Informe ao menos um item recebido' })
  @ArrayMaxSize(MAX_ORDER_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];
}

export class FromSuggestionsDto {
  @IsOptional()
  @IsUUID('4')
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos um item' })
  @ArrayMaxSize(MAX_ORDER_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}

export class QueryPurchaseOrderDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  // Só os que ainda esperam mercadoria (pendente, enviado, parcial).
  @IsOptional()
  @Transform(toBoolean)
  open?: boolean;
}

const CLASSIFICATIONS = [
  'CRITICAL',
  'REPLENISH',
  'BELOW_MIN',
  'STALE',
  'EXCESS',
  'INSUFFICIENT',
  'OK',
] as const satisfies readonly Classification[];

export class QuerySuggestionDto extends PageQueryDto {
  // Sobrepõe a janela de análise configurada.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(366)
  days?: number;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsIn(CLASSIFICATIONS)
  classification?: Classification;

  // Só o que tem quantidade sugerida (> 0).
  @IsOptional()
  @Transform(toBoolean)
  onlyActionable?: boolean;
}

export class SettingsDto {
  @IsInt()
  @Min(7)
  @Max(366)
  analysisDays: number;

  @IsInt()
  @Min(0)
  @Max(180)
  leadTimeDays: number;

  @IsInt()
  @Min(1)
  @Max(365)
  coverDays: number;

  @IsInt()
  @Min(1)
  @Max(100)
  minSales: number;

  @IsInt()
  @Min(1)
  @Max(366)
  minHistoryDays: number;

  @IsInt()
  @Min(30)
  @Max(1095)
  excessDays: number;
}

export class QueryGroupSuggestionDto {
  // Sobrepõe a janela de análise configurada.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(366)
  days?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  category?: string;
}
