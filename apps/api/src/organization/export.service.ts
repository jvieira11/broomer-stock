import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Writable } from 'node:stream';
import type { AuthUser } from '../auth/auth.types';
import { OPERATION_LABELS } from '../movements/stock-rules';
import { PrismaService } from '../prisma/prisma.service';
import { formatCnpj } from './cnpj';

const TIME_ZONE = 'America/Sao_Paulo';
const PAGE = 5000;

const MONEY = '#,##0.00';
const COST = '#,##0.00##';
const QUANTITY = '#,##0';
const DATE_TIME = 'dd/mm/yyyy hh:mm';

const roleLabels = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  OPERATOR: 'Operador',
  VIEWER: 'Consulta',
};

// O Excel não guarda fuso: gravamos a data já no horário de Brasília para a
// planilha mostrar a mesma hora que o sistema.
const zoneParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function localDate(date: Date | null) {
  if (!date) return null;
  const p = Object.fromEntries(
    zoneParts.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return new Date(
    Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second),
  );
}

const num = (value: { toString(): string }) => Number(value.toString());

// Planilha com todos os dados da loja: backup legível e portabilidade
// (LGPD, art. 18). Escrita em fluxo, sem montar o
// arquivo inteiro na memória.
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async write(user: AuthUser, output: Writable) {
    const organizationId = user.organizationId;
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: output,
      useStyles: true,
    });
    workbook.creator = 'Broomer Estoque';

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const info = workbook.addWorksheet('Empresa');
    info.columns = [{ width: 22 }, { width: 50 }];
    info.addRow(['Empresa', organization.name]).commit();
    info
      .addRow(['CNPJ', organization.cnpj ? formatCnpj(organization.cnpj) : ''])
      .commit();
    const created = info.addRow([
      'Cadastrada em',
      localDate(organization.createdAt),
    ]);
    created.getCell(2).numFmt = DATE_TIME;
    created.commit();
    const exported = info.addRow(['Exportado em', localDate(new Date())]);
    exported.getCell(2).numFmt = DATE_TIME;
    exported.commit();
    info.addRow(['Exportado por', `${user.name} (${user.email})`]).commit();
    info.commit();

    const variants = sheet(workbook, 'Estoque', [
      ['Referência', 14],
      ['Produto', 40],
      ['SKU', 16],
      ['Tamanho', 10],
      ['Cor', 18],
      ['Categoria', 20],
      ['Fornecedor', 28],
      ['Coleção', 20],
      ['Linha/modelagem', 16],
      ['Saldo', 10, QUANTITY],
      ['Estoque mínimo', 15, QUANTITY],
      ['Custo médio', 14, COST],
      ['Preço de venda', 15, MONEY],
      ['Produto ativo', 13],
      ['Variação ativa', 14],
      ['Cadastrado em', 17, DATE_TIME],
    ]);
    for (const v of await this.prisma.productVariant.findMany({
      where: { organizationId },
      include: {
        product: {
          include: {
            category: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        },
      },
      orderBy: [
        { product: { name: 'asc' } },
        { color: 'asc' },
        { size: 'asc' },
      ],
    })) {
      const p = v.product;
      variants
        .addRow([
          p.reference,
          p.name,
          v.sku,
          v.size,
          v.color,
          p.category?.name ?? '',
          p.supplier?.name ?? '',
          p.collection ?? '',
          p.fit ?? '',
          v.quantity,
          v.minQuantity ?? p.minQuantity,
          num(v.averageCost),
          num(v.salePrice ?? p.salePrice),
          p.active ? 'Sim' : 'Não',
          v.active ? 'Sim' : 'Não',
          localDate(v.createdAt),
        ])
        .commit();
    }
    variants.commit();

    const categories = sheet(workbook, 'Categorias', [
      ['Nome', 30],
      ['Descrição', 50],
      ['Ativa', 8],
    ]);
    for (const c of await this.prisma.category.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    })) {
      categories
        .addRow([c.name, c.description ?? '', c.active ? 'Sim' : 'Não'])
        .commit();
    }
    categories.commit();

    const movements = sheet(workbook, 'Movimentações', [
      ['Data', 17, DATE_TIME],
      ['Operação', 10],
      ['Tipo', 22],
      ['Referência da venda', 18],
      ['SKU', 16],
      ['Produto', 40],
      ['Tamanho', 10],
      ['Cor', 18],
      ['Quantidade', 12, QUANTITY],
      ['Saldo antes', 12, QUANTITY],
      ['Saldo depois', 13, QUANTITY],
      ['Custo unitário', 14, COST],
      ['Motivo', 40],
      ['Origem', 28],
      ['Usuário', 25],
    ]);
    // Em páginas: o histórico cresce sem limite.
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.stockMovement.findMany({
        where: { organizationId },
        include: {
          operation: true,
          variant: { include: { product: { select: { name: true } } } },
          user: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: PAGE,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });
      for (const m of page) {
        movements
          .addRow([
            localDate(m.operation.occurredAt),
            m.operation.number,
            OPERATION_LABELS[m.operation.type],
            m.operation.saleReference ?? '',
            m.variant.sku,
            m.variant.product.name,
            m.variant.size,
            m.variant.color,
            m.quantity,
            m.balanceBefore,
            m.balanceAfter,
            num(m.unitCost),
            m.operation.reason ?? '',
            m.operation.origin ?? '',
            m.user.name,
          ])
          .commit();
      }
      if (page.length < PAGE) break;
      cursor = page[page.length - 1].id;
    }
    movements.commit();

    // Sem senhas: só quem é quem e o aceite dos termos.
    const users = sheet(workbook, 'Usuários', [
      ['Nome', 30],
      ['E-mail', 32],
      ['Papel', 15],
      ['Ativo', 8],
      ['Termos aceitos (versão)', 22],
      ['Termos aceitos em', 18, DATE_TIME],
      ['Cadastrado em', 17, DATE_TIME],
    ]);
    for (const u of await this.prisma.user.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    })) {
      users
        .addRow([
          u.name,
          u.email,
          roleLabels[u.role],
          u.active ? 'Sim' : 'Não',
          u.termsVersion ?? '',
          localDate(u.termsAcceptedAt),
          localDate(u.createdAt),
        ])
        .commit();
    }
    users.commit();

    await workbook.commit();
  }
}

function sheet(
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  name: string,
  columns: [header: string, width: number, numFmt?: string][],
) {
  const worksheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  worksheet.columns = columns.map(([header, width, numFmt]) => ({
    header,
    width,
    ...(numFmt && { style: { numFmt } }),
  }));
  worksheet.getRow(1).font = { bold: true };
  return worksheet;
}
