import { api } from "@/lib/api";
import { csvCell } from "@/lib/csv";
import { formatDateTime, operationLabels } from "@/lib/format";
import type { Movement, Page } from "@/lib/types";

const FILTERS = [
  "search",
  "type",
  "from",
  "to",
  "categoryId",
  "size",
  "color",
  "userId",
  "productId",
  "variantId",
];
const PAGE_SIZE = 200;
const MAX_ROWS = 20_000;


// Exporta o histórico com os mesmos filtros da tela. A API confere o login e
// a loja em cada página buscada.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of FILTERS) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }
  query.set("pageSize", String(PAGE_SIZE));

  const lines = [
    [
      "Data",
      "Operação",
      "Tipo",
      "Referência da venda",
      "Referência do produto",
      "Produto",
      "SKU",
      "Tamanho",
      "Cor",
      "Quantidade",
      "Saldo antes",
      "Saldo depois",
      "Custo unitário",
      "Motivo",
      "Origem",
      "Observações",
      "Responsável",
    ].join(";"),
  ];

  for (let page = 1; (page - 1) * PAGE_SIZE < MAX_ROWS; page += 1) {
    query.set("page", String(page));
    const result = await api.get<Page<Movement>>(`/movements?${query}`);
    for (const m of result.items) {
      lines.push(
        [
          formatDateTime(m.operation.occurredAt),
          m.operation.number,
          operationLabels[m.operation.type],
          m.operation.saleReference,
          m.variant.product.reference,
          m.variant.product.name,
          m.variant.sku,
          m.variant.size,
          m.variant.color,
          m.quantity,
          m.balanceBefore,
          m.balanceAfter,
          m.unitCost.replace(".", ","),
          m.operation.reason,
          m.operation.origin,
          m.operation.notes,
          m.user.name,
        ]
          .map(csvCell)
          .join(";"),
      );
    }
    if (page * PAGE_SIZE >= result.total) break;
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="broomer-historico-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
