import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/settings-forms";
import { Card, PageHeader } from "@/components/ui";
import { getMe } from "@/lib/data";
import { roleLabels } from "@/lib/permissions";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const me = await getMe();

  return (
    <>
      <PageHeader title="Minha conta" description={me.email} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Seus dados" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-neutral-500">Nome</dt>
              <dd className="font-medium">{me.name}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Loja</dt>
              <dd className="font-medium">{me.organization.name}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Papel</dt>
              <dd className="font-medium">{roleLabels[me.role]}</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
            Para mudar nome, e-mail ou papel, fale com o administrador.

          </p>
        </Card>
        <Card title="Trocar senha" className="lg:col-span-2">
          <div className="max-w-sm">
            <ChangePasswordForm />
          </div>
        </Card>
      </div>
    </>
  );
}
