"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useRef,
} from "react";
import { isNetworkError, NETWORK_ERROR } from "@/lib/network";
import type { FormState } from "@/lib/types";

// Como useActionState, mas o formulário só é limpo quando a ação dá certo.
// O React limpa formulários com `action={...}` sempre, inclusive quando a
// ação devolve erro — e o usuário perderia tudo o que digitou.
export function useFormAction<S extends FormState = FormState>(
  action: (prev: S, formData: FormData) => Promise<S>,
) {
  // Falha de rede vira mensagem no próprio formulário, que mantém o que foi digitado.
  const safeAction = async (prev: S, formData: FormData): Promise<S> => {
    try {
      return await action(prev, formData);
    } catch (error) {
      if (isNetworkError(error)) {
        return { ...prev, error: NETWORK_ERROR, success: undefined };
      }
      throw error;
    }
  };
  const [state, dispatch, pending] = useActionState<S, FormData>(
    safeAction,
    {} as Awaited<S>,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, formRef, onSubmit };
}
