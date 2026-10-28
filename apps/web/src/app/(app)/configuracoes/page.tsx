import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrganizationForm } from "@/components/settings-forms";
import { buttonClass, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { getMe } from "@/lib/data";
import { canManageUsers } from "@/lib/permissions";
import type { Organization } from "@/lib/types";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const me = await getMe();
  if (!canManageUsers(me.role)) notFound();

  const organization = await api.get<Organization>("/organization");

  return (
    <>
      <PageHeader title="Configurações" description="Dados da loja e cópia de segurança" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Dados da loja">
          <div>
            <OrganizationForm organization={organization} />
          </div>
        </Card>
        <Card title="Exportar dados">
          <div className="space-y-4 text-sm text-neutral-600">
            <p>
              Baixe uma planilha do Excel com tudo o que a loja tem no
              sistema: estoque por SKU, categorias, todas as movimentações e a lista
              de usuários (sem senhas).
            </p>
            <p>
              Serve como cópia de segurança, para levar os dados para outro
              sistema ou para atender um pedido de portabilidade (LGPD).
            </p>
            {/* Link comum (não <Link>): é um download, não uma página. */}
            <a href="/configuracoes/exportar" download className={buttonClass.secondary}>
              Baixar planilha (.xlsx)
            </a>
          </div>
        </Card>
      </div>
    </>
  );
}
