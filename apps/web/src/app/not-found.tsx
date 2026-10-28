import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-stone-900">Página não encontrada</h1>
      <p className="mt-2 text-sm text-stone-500">
        O registro que você procura não existe ou foi removido.
      </p>
      <Link href="/" className={`${buttonClass.primary} mt-6`}>
        Voltar ao painel
      </Link>
    </div>
  );
}
