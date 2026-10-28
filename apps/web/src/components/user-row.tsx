"use client";

import { useState, useTransition } from "react";
import { updateUser } from "@/lib/actions";
import { roleLabels } from "@/lib/permissions";
import type { FormState, Role, User } from "@/lib/types";
import { Badge, buttonClass, cellClass, inputClass } from "./ui";
import { ROLES } from "./user-form";

export function UserRow({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});

  function save(changes: Parameters<typeof updateUser>[1]) {
    startTransition(async () => setResult(await updateUser(user.id, changes)));
  }

  function resetPassword() {
    const password = prompt(`Nova senha para ${user.name} (mínimo 8 caracteres):`);
    if (password === null) return;
    if (password.length < 8) {
      setResult({ error: "A senha deve ter pelo menos 8 caracteres." });
      return;
    }
    save({ password });
  }

  return (
    <tr className={`hover:bg-stone-50 ${user.active ? "" : "opacity-60"}`}>
      <td className={cellClass}>
        <p className="font-medium">
          {user.name}
          {isSelf && <span className="ml-2 text-xs text-stone-400">(você)</span>}
        </p>
        <p className="text-xs text-stone-500">{user.email}</p>
        {result.error && <p className="mt-1 text-xs text-red-600">{result.error}</p>}
      </td>
      <td className={cellClass}>
        {isSelf ? (
          roleLabels[user.role]
        ) : (
          <select
            aria-label={`Papel de ${user.name}`}
            value={user.role}
            disabled={pending}
            onChange={(e) => save({ role: e.target.value as Role })}
            className={`${inputClass} w-auto py-1`}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className={cellClass}>
        {user.active ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}
      </td>
      <td className={cellClass}>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={resetPassword}
            disabled={pending}
            className={buttonClass.secondary}
          >
            Redefinir senha
          </button>
          {!isSelf && (
            <button
              type="button"
              disabled={pending}
              onClick={() => save({ active: !user.active })}
              className={user.active ? buttonClass.danger : buttonClass.secondary}
            >
              {user.active ? "Desativar" : "Reativar"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
