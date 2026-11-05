import Link from "next/link";
import type { ReactNode } from "react";
import { operationLabels, statusLabels } from "@/lib/format";
import type { OperationType, StockStatus } from "@/lib/types";

export const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-xs outline-none transition placeholder:text-neutral-400 focus:border-ink-800 focus:ring-2 focus:ring-ink-800/10 disabled:bg-neutral-100";

export const labelClass = "mb-1.5 block text-sm font-medium text-ink-800";

export const hintClass = "mt-1 text-xs text-neutral-500";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 disabled:cursor-not-allowed disabled:opacity-60";

export const buttonClass = {
  primary: `${buttonBase} bg-ink-900 text-white hover:bg-ink-700`,
  accent: `${buttonBase} bg-accent-500 text-white hover:bg-accent-600`,
  secondary: `${buttonBase} border border-neutral-300 bg-white text-ink-800 hover:bg-neutral-100`,
  ghost: `${buttonBase} text-ink-700 hover:bg-neutral-100`,
  danger: `${buttonBase} border border-red-200 bg-white text-red-700 hover:bg-red-50`,
};

export const linkClass =
  "font-semibold text-ink-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-ink-900";

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-600">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-[1.7rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  action,
  children,
  className = "",
  flush = false,
  visible = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  // Sem padding interno (tabelas encostadas na borda).
  flush?: boolean;
  // Não recorta o conteúdo (listas suspensas que passam da borda do cartão).
  visible?: boolean;
}) {
  return (
    <section
      className={`min-w-0 ${visible ? "" : "overflow-hidden"} rounded-xl border border-neutral-200 bg-white shadow-xs ${className}`}
    >
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {description && (
              <p className="text-xs text-neutral-500">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
  href?: string;
  icon?: ReactNode;
}) {
  const toneClass = {
    default: "text-ink-900",
    success: "text-emerald-700",
    warning: "text-amber-600",
    danger: "text-red-600",
  }[tone];

  const content = (
    <div className="h-full rounded-xl border border-neutral-200 bg-white p-4 shadow-xs transition hover:border-neutral-300 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </p>
        {icon && <span className="text-neutral-400">{icon}</span>}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "dark";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const toneClass = {
    neutral: "bg-neutral-100 text-neutral-700 ring-neutral-200",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
    danger: "bg-red-50 text-red-700 ring-red-200",
    info: "bg-sky-50 text-sky-700 ring-sky-200",
    dark: "bg-ink-900 text-white ring-ink-900",
  }[tone];

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneClass}`}
    >
      {children}
    </span>
  );
}

const statusTones: Record<StockStatus, Tone> = {
  OUT: "danger",
  LOW: "warning",
  NORMAL: "success",
};

export function StatusBadge({ status }: { status: StockStatus }) {
  return <Badge tone={statusTones[status]}>{statusLabels[status]}</Badge>;
}

const operationTones: Record<OperationType, Tone> = {
  ENTRY: "success",
  SALE: "dark",
  CUSTOMER_RETURN: "info",
  SUPPLIER_RETURN: "warning",
  LOSS: "danger",
  INVENTORY: "info",
  REVERSAL: "neutral",
  INITIAL_LOAD: "neutral",
};

export function OperationBadge({ type }: { type: OperationType }) {
  return <Badge tone={operationTones[type]}>{operationLabels[type]}</Badge>;
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 rounded-full bg-neutral-100 p-3 text-neutral-500">
          {icon}
        </div>
      )}
      <p className="font-semibold text-ink-900">{title}</p>
      {children && (
        <div className="mt-1 max-w-md text-sm text-neutral-500">{children}</div>
      )}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Table({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">{children}</tbody>
      </table>
    </div>
  );
}

export const cellClass = "whitespace-nowrap px-3 py-3";
export const rowClass = "transition hover:bg-neutral-50";

// Paginação por links: mantém os filtros da página na URL.
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: URLSearchParams;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (target: number) => {
    const query = new URLSearchParams(params);
    query.set("page", String(target));
    return `${basePath}?${query}`;
  };
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 text-sm text-neutral-600"
    >
      <span>
        {first}–{last} de {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass.secondary}>
            Anterior
          </Link>
        ) : (
          <span className={`${buttonClass.secondary} opacity-50`}>Anterior</span>
        )}
        <span className="self-center px-1 tabular-nums">
          {page}/{pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass.secondary}>
            Próxima
          </Link>
        ) : (
          <span className={`${buttonClass.secondary} opacity-50`}>Próxima</span>
        )}
      </div>
    </nav>
  );
}

// Formulário de filtros por GET: funciona sem JavaScript e fica na URL.
export function FilterBar({
  children,
  clearHref,
}: {
  children: ReactNode;
  clearHref: string;
}) {
  return (
    <form className="grid gap-3 border-b border-neutral-100 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      {children}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1 lg:col-start-4">
        <button type="submit" className={`${buttonClass.primary} flex-1`}>
          Filtrar
        </button>
        <Link href={clearHref} className={buttonClass.ghost}>
          Limpar
        </Link>
      </div>
    </form>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}
