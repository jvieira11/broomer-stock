import { LogOut } from "lucide-react";
import Link from "next/link";
import { MobileNav, Nav, Wordmark } from "@/components/nav";
import { InstallAppButton } from "@/components/pwa";
import { logout } from "@/lib/actions";
import { getMe } from "@/lib/data";
import type { Me } from "@/lib/types";
import { canManageUsers, canMoveStock, roleLabels } from "@/lib/permissions";

function SidebarContent({ me }: { me: Me }) {
  return (
    <>
      <Nav canMove={canMoveStock(me.role)} isAdmin={canManageUsers(me.role)} />

      <div className="mt-4">
        <InstallAppButton />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 px-1 pt-4">
        <Link
          href="/conta"
          title="Minha conta"
          className="min-w-0 rounded-lg px-2 py-1.5 hover:bg-white/5"
        >
          <p className="truncate text-sm font-semibold text-white">{me.name}</p>
          <p className="truncate text-xs text-neutral-400">{roleLabels[me.role]}</p>
        </Link>
        <form action={logout}>
          <button
            type="submit"
            title="Sair"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={15} />
            Sair
          </button>
        </form>
      </div>
    </>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await getMe();

  return (
    <div className="min-h-screen lg:flex">
      <MobileNav>
        <SidebarContent me={me} />
      </MobileNav>

      <aside className="hidden bg-ink-900 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:px-4 lg:py-6">
        <Link href="/dashboard" className="mb-8 px-3" aria-label="Início">
          <Wordmark />
        </Link>
        <SidebarContent me={me} />
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
