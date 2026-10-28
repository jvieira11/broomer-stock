import { Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryForm } from "@/components/category-form";
import { CategoryRow } from "@/components/category-row";
import { buttonClass, Card, EmptyState, inputClass, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { getMe, pickQuery } from "@/lib/data";
import { canEditCatalog } from "@/lib/permissions";
import type { Category } from "@/lib/types";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage({ searchParams }: PageProps<"/categorias">) {
  const query = pickQuery(await searchParams, ["search", "active"]);
  const [me, categories] = await Promise.all([
    getMe(),
    api.get<Category[]>(`/categories?${query}`),
  ]);
  const canEdit = canEditCatalog(me.role);

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Organização dos produtos da loja. Categorias com produtos são desativadas, não excluídas."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        {canEdit && (
          <Card title="Nova categoria" className="lg:col-span-1 lg:self-start">
            <CategoryForm />
          </Card>
        )}
        <Card
          title={`${categories.length} categoria(s)`}
          className={canEdit ? "lg:col-span-2" : "lg:col-span-3"}
          action={
            <form className="flex gap-2">
              <input
                name="search"
                aria-label="Buscar categoria"
                placeholder="Buscar"
                defaultValue={query.get("search") ?? ""}
                className={`${inputClass} w-40 py-1.5`}
              />
              <select
                name="active"
                aria-label="Situação"
                defaultValue={query.get("active") ?? ""}
                className={`${inputClass} w-32 py-1.5`}
              >
                <option value="">Todas</option>
                <option value="true">Ativas</option>
                <option value="false">Desativadas</option>
              </select>
              <button type="submit" className={`${buttonClass.secondary} py-1.5`}>
                Filtrar
              </button>
            </form>
          }
        >
          {categories.length === 0 ? (
            <EmptyState icon={<Tags size={22} />} title="Nenhuma categoria encontrada">
              {query.size ? (
                <Link href="/categorias">Limpar filtros</Link>
              ) : (
                "Crie as categorias usadas pela loja (ex.: camisas, calças, acessórios)."
              )}
            </EmptyState>
          ) : (
            <ul className="-my-4 divide-y divide-stone-100">
              {categories.map((c) => (
                <CategoryRow key={c.id} category={c} canEdit={canEdit} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
