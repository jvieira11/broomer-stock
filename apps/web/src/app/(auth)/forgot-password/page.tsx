import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Esqueci minha senha</h1>
      <p className="mb-5 mt-1 text-sm text-neutral-500">
        Informe o e-mail da sua conta. Enviaremos um link para criar uma senha
        nova.
      </p>
      <ForgotPasswordForm />
      <p className="mt-5 text-center text-sm text-neutral-500">
        Lembrou?{" "}
        <Link href="/login" className="font-medium text-accent-700 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </>
  );
}
