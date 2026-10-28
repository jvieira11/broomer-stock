import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { expired, reset } = await searchParams;

  return (
    <>
      <h1 className="text-xl font-bold">Entrar</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Acesse o estoque da Broomer.
      </p>
      {expired && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sua sessão expirou ou foi encerrada. Entre de novo.
        </p>
      )}
      {reset && (
        <p className="mb-4 rounded-md border border-brass-200 bg-brass-50 px-3 py-2 text-sm text-brass-700">
          Senha alterada. Entre com a senha nova.
        </p>
      )}
      <LoginForm />
      <p className="mt-5 text-center text-xs text-stone-500">
        Não tem acesso? Peça ao administrador da loja para criar sua conta.
      </p>
    </>
  );
}
