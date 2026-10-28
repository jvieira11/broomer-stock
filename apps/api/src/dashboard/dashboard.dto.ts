import { IsOptional, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Período dos totais de entradas e saídas. Padrão: últimos 30 dias.
export class DashboardQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'Data inicial inválida (use AAAA-MM-DD)' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'Data final inválida (use AAAA-MM-DD)' })
  to?: string;
}
