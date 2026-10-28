"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useRef,
} from "react";
import type { FormState } from "@/lib/types";

// Como useActionState, mas o formulário só é limpo quando a ação dá certo.
// O React limpa formulários com `action={...}` sempre, inclusive quando a
// ação devolve erro — e o usuário perderia tudo o que digitou.
export function useFormAction<S extends FormState = FormState>(
  action: (prev: S, formData: FormData) => Promise<S>,
) {
  const [state, dispatch, pending] = useActionState<S, FormData>(
    action,
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
