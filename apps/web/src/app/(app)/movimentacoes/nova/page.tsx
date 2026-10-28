import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperationForm } from "@/components/operation-form";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { getMe } from "@/lib/data";
import { allowedOperations } from "@/lib/permissions";
import type { OperationType, Page, StockItem } from "@/lib/types";

export const metadata: Metadata = { title: "Registrar movimentação" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewOperationPage({
  searchParams,
}: PageProps<"/movimentacoes/nova">) {
  const params = await searchParams;
  const me = await getMe();
  const allowed = allowedOperations(me.role);
  if (allowed.length === 0) notFound();

  const requested = params.tipo as OperationType | undefined;
  const initialType = requested && allowed.includes(requested) ? requested : "SALE";

  // Vindo da página de um produto: mostra as variações dele como atalho.
  const productId = typeof params.produto === "string" ? params.produto : "";
  const preset = UUID.test(productId)
    ? (
        await api.get<Page<StockItem>>(
          `/variants?${new URLSearchParams({ productId, pageSize: "200" })}`,
        )
      ).items
    : [];

  return (
    <>
      <PageHeader
        title="Registrar movimentação"
        description="Uma venda pode ter várias peças: todas ficam na mesma operação, cada uma baixando o próprio SKU."
      />
      <OperationForm allowedTypes={allowed} initialType={initialType} preset={preset} />
    </>
  );
}
