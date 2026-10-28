export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-900 px-4 py-12">
      <div className="mb-8 flex flex-col items-center leading-none">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo estático */}
        <img
          src="/brand/broomer-logo.png"
          alt="Broomer"
          width={500}
          height={74}
          className="h-10 w-auto brightness-0 invert"
        />
        <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-accent-400">
          Gestão de estoque
        </span>
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl">
        {children}
      </div>
      <p className="mt-6 text-xs text-neutral-500">
        Acesso restrito à equipe da Broomer · Maceió/AL
      </p>
    </div>
  );
}
