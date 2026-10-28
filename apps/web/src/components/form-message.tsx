import type { FormState } from "@/lib/types";

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p
        aria-live="polite"
        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
      >
        {state.success}
      </p>
    );
  }
  return null;
}
