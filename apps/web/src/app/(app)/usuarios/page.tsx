import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader, Table } from "@/components/ui";
import { UserForm } from "@/components/user-form";
import { UserRow } from "@/components/user-row";
import { api } from "@/lib/api";
import { getMe } from "@/lib/data";
import { canManageUsers, roleDescriptions, roleLabels } from "@/lib/permissions";
import type { Role, User } from "@/lib/types";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage() {
  const me = await getMe();
  if (!canManageUsers(me.role)) notFound();

  const users = await api.get<User[]>("/users");

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Quem acessa o sistema. Não há cadastro público: só o administrador cria contas."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card title="Novo usuário">
            <UserForm />
          </Card>
          <Card title="Papéis">
            <dl className="space-y-2 text-sm">
              {(Object.keys(roleLabels) as Role[]).map((role) => (
                <div key={role}>
                  <dt className="font-medium">{roleLabels[role]}</dt>
                  <dd className="text-stone-500">{roleDescriptions[role]}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
        <Card title={`${users.length} usuário(s)`} className="lg:col-span-2">
          <Table head={["Usuário", "Papel", "Situação", ""]}>
            {users.map((user) => (
              <UserRow key={user.id} user={user} isSelf={user.id === me.id} />
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
