export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-900 px-4 py-12">
      <div className="mb-8 flex flex-col items-center leading-none">
        <span className="font-display text-3xl font-semibold tracking-[0.35em] text-white">
          BROOMER
        </span>
        <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-brass-400">
          Gestão de estoque
        </span>
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl">
        {children}
      </div>
      <p className="mt-6 text-xs text-stone-500">
        Acesso restrito à equipe da Broomer · Maceió/AL
      </p>
    </div>
  );
}
