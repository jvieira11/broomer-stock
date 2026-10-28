"use client";

import Link from "next/link";
import { forgotPassword, login, resetPassword } from "@/lib/actions";
import { FormMessage } from "./form-message";
import { buttonClass, inputClass, labelClass } from "./ui";
import { useFormAction } from "./use-form-action";

export function LoginForm() {
  const { state, pending, formRef, onSubmit } = useFormAction(login);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className={labelClass}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          className={inputClass}
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className={labelClass}>
            Senha
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-brass-700 hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>
      <FormMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass.primary} w-full`}
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { state, pending, formRef, onSubmit } = useFormAction(forgotPassword);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className={labelClass}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          className={inputClass}
        />
      </div>
      <FormMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass.primary} w-full`}
      >
        {pending ? "Enviando..." : "Enviar link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { state, pending, formRef, onSubmit } = useFormAction(resetPassword);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className={labelClass}>
          Senha nova
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
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
      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass.primary} w-full`}
      >
        {pending ? "Salvando..." : "Salvar senha nova"}
      </button>
    </form>
  );
}
