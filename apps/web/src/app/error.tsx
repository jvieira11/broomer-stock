"use client";

import { buttonClass } from "@/components/ui";

// Aparece quando uma página não consegue carregar os dados (ex.: API fora do ar).
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-stone-900">
        Não foi possível carregar esta página
      </h1>
      <p className="mt-2 text-sm text-stone-500">
        Verifique se a API está rodando (<code>pnpm dev:api</code>) e se o banco
        está de pé (<code>pnpm db:up</code>).
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-stone-400">Código: {error.digest}</p>
      )}
      <button type="button" onClick={retry} className={`${buttonClass.primary} mt-6`}>
        Tentar de novo
      </button>
    </div>
  );
}
