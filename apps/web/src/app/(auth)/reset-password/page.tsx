import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = {
  title: "Criar senha nova",
  // O link tem um token de acesso: não pode vazar para outros sites.
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { token } = await searchParams;

  if (typeof token !== "string" || token === "") {
    return (
      <>
        <h1 className="text-lg font-semibold">Link inválido</h1>
        <p className="mb-5 mt-1 text-sm text-neutral-500">
          Abra o link exatamente como veio no e-mail, ou peça um novo.
        </p>
        <Link
          href="/forgot-password"
          className="font-medium text-accent-700 hover:underline"
        >
          Pedir um link novo
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-lg font-semibold">Criar senha nova</h1>
      <p className="mb-5 mt-1 text-sm text-neutral-500">
        Depois de salvar, você sai de todos os aparelhos e entra de novo com a
        senha nova.
      </p>
      <ResetPasswordForm token={token} />
      <p className="mt-5 text-center text-sm text-neutral-500">
        O link expirou?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-accent-700 hover:underline"
        >
          Peça um novo
        </Link>
      </p>
    </>
  );
}
