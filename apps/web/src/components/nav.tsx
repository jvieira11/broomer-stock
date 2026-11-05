"use client";

import {
  ArrowLeftRight,
  Boxes,
  History,
  LayoutDashboard,
  Menu,
  Settings,
  Shirt,
  ShoppingCart,
  Tags,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

interface NavFlags {
  canMove: boolean;
  isAdmin: boolean;
}

function links({ canMove, isAdmin }: NavFlags) {
  return [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/estoque", label: "Estoque", icon: Boxes },
    { href: "/produtos", label: "Produtos", icon: Shirt },
    ...(canMove
      ? [
          {
            href: "/movimentacoes/nova",
            label: "Nova movimentação",
            icon: ArrowLeftRight,
          },
        ]
      : []),
    { href: "/movimentacoes", label: "Histórico", icon: History },
    { href: "/compras", label: "Compras", icon: ShoppingCart },
    { href: "/categorias", label: "Categorias", icon: Tags },
    ...(isAdmin
      ? [
          { href: "/usuarios", label: "Usuários", icon: Users },
          { href: "/configuracoes", label: "Configurações", icon: Settings },
        ]
      : []),
  ];
}

// O link mais específico que casa com a URL fica ativo (Histórico não acende
// junto com "Registrar movimentação").
function activeHref(pathname: string, hrefs: string[]) {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

export function Nav(flags: NavFlags) {
  const pathname = usePathname();
  const items = links(flags);
  const active = activeHref(
    pathname,
    items.map((i) => i.href),
  );

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const current = href === active;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              current
                ? "bg-white/10 text-white"
                : "text-neutral-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon
              size={17}
              strokeWidth={1.8}
              className={current ? "text-accent-400" : ""}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// Logo oficial (cinza, fundo transparente) pintado de branco para o fundo
// preto do menu.
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex flex-col leading-none">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo estático pequeno */}
      <img
        src="/brand/broomer-logo.png"
        alt="Broomer"
        width={500}
        height={74}
        className={`w-auto brightness-0 invert ${compact ? "h-5" : "h-6"}`}
      />
      {!compact && (
        <span className="mt-2 pl-[22%] text-[10px] font-semibold uppercase tracking-[0.3em] text-accent-400">
          Estoque
        </span>
      )}
    </span>
  );
}

// Celular e tablet: barra no topo com o menu em gaveta.
export function MobileNav({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  // A gaveta lembra em que página foi aberta: ao navegar, fecha sozinha.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (value: boolean) => setOpenAt(value ? pathname : null);

  return (
    <div className="lg:hidden">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink-900 px-4 py-3">
        <Link href="/dashboard" aria-label="Início">
          <Wordmark compact />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-neutral-300 hover:bg-white/10 hover:text-white"
        >
          <Menu size={22} />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-ink-950/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-ink-900 p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2 pt-1">
              <Wordmark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
