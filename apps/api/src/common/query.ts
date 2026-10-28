import { BadRequestException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

// Paginação comum às listagens: ?page=1&pageSize=50.
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 50;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Período em dias do calendário de Maceió: ?from=2026-10-01&to=2026-10-31.
export class PeriodQueryDto extends PageQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'Data inicial inválida (use AAAA-MM-DD)' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'Data final inválida (use AAAA-MM-DD)' })
  to?: string;
}

// Alagoas usa UTC-3 o ano todo (sem horário de verão desde 2019).
const STORE_OFFSET = '-03:00';

export function dayStart(date: string) {
  const value = new Date(`${date}T00:00:00${STORE_OFFSET}`);
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException(`Data inválida: ${date}`);
  }
  return value;
}

// Intervalo [início do dia "from", início do dia seguinte a "to").
export function periodFilter(query: { from?: string; to?: string }) {
  if (!query.from && !query.to) return undefined;
  const filter: { gte?: Date; lt?: Date } = {};
  if (query.from) filter.gte = dayStart(query.from);
  if (query.to) {
    const end = dayStart(query.to);
    end.setUTCDate(end.getUTCDate() + 1);
    filter.lt = end;
  }
  if (filter.gte && filter.lt && filter.gte >= filter.lt) {
    throw new BadRequestException('A data inicial é depois da final');
  }
  return filter;
}

export const paging = (query: PageQueryDto) => ({
  skip: (query.page - 1) * query.pageSize,
  take: query.pageSize,
});

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
