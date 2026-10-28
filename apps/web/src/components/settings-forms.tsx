"use client";

import { changePassword, saveOrganization } from "@/lib/actions";
import type { Organization } from "@/lib/types";
import { FormMessage } from "./form-message";
import { buttonClass, inputClass, labelClass } from "./ui";
import { useFormAction } from "./use-form-action";

export function ChangePasswordForm() {
  const { state, pending, formRef, onSubmit } = useFormAction(changePassword);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="currentPassword" className={labelClass}>
          Senha atual
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="newPassword" className={labelClass}>
          Senha nova
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-stone-500">Mínimo de 8 caracteres.</p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className={labelClass}>
          Confirme a senha nova
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Salvando..." : "Trocar senha"}
      </button>
    </form>
  );
}

// "11222333000181" -> "11.222.333/0001-81" (também o CNPJ com letras).
function formatCnpj(cnpj: string | null) {
  return (cnpj ?? "").replace(
    /^(.{2})(.{3})(.{3})(.{4})(.{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

export function OrganizationForm({
  organization,
}: {
  organization: Organization;
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(saveOrganization);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="org-name" className={labelClass}>
          Nome da empresa *
        </label>
        <input
          id="org-name"
          name="name"
          required
          maxLength={150}
          defaultValue={organization.name}
          autoComplete="organization"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="org-cnpj" className={labelClass}>
          CNPJ
        </label>
        <input
          id="org-cnpj"
          name="cnpj"
          maxLength={18}
          defaultValue={formatCnpj(organization.cnpj)}
          placeholder="00.000.000/0000-00"
          className={`${inputClass} uppercase`}
        />
        <p className="mt-1 text-xs text-stone-500">
          Aceita o CNPJ com letras. Deixe em branco para apagar.
        </p>
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
