import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportStock } from "@/components/import-stock";
import { PageHeader } from "@/components/ui";
import { getMe } from "@/lib/data";
import { canManageUsers } from "@/lib/permissions";

export const metadata: Metadata = { title: "Importar estoque" };

export default async function ImportPage() {
  const me = await getMe();
  if (!canManageUsers(me.role)) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Produtos"
        title="Importar estoque do ERP"
        description="Carga inicial a partir do relatório “estoque final do dia”. Tamanho e cor DV/- viram tamanho único/sem cor; grafias são padronizadas; saldos negativos entram como 0."
      />
      <ImportStock />
    </>
  );
}
