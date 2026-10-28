"use client";

import { createUser } from "@/lib/actions";
import { roleDescriptions, roleLabels } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { FormMessage } from "./form-message";
import { buttonClass, inputClass, labelClass } from "./ui";
import { useFormAction } from "./use-form-action";

export const ROLES: Role[] = ["ADMIN", "MANAGER", "OPERATOR", "VIEWER"];

export function UserForm() {
  const { state, pending, formRef, onSubmit } = useFormAction(createUser);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="user-name" className={labelClass}>
          Nome *
        </label>
        <input id="user-name" name="name" required maxLength={150} className={inputClass} />
      </div>
      <div>
        <label htmlFor="user-email" className={labelClass}>
          E-mail *
        </label>
        <input
          id="user-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="user-password" className={labelClass}>
          Senha inicial *
        </label>
        <input
          id="user-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-stone-500">
          Mínimo de 8 caracteres. Passe para a pessoa por um canal seguro.
        </p>
      </div>
      <div>
        <label htmlFor="user-role" className={labelClass}>
          Papel *
        </label>
        <select id="user-role" name="role" defaultValue="OPERATOR" className={inputClass}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]} — {roleDescriptions[role]}
            </option>
          ))}
        </select>
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Criando..." : "Criar usuário"}
      </button>
    </form>
  );
}
