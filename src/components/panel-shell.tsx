"use client";

import type { ReactNode } from "react";

interface PanelShellProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Shared surface for major views — calm card, clear title. */
export function PanelShell({
  title,
  description,
  icon,
  actions,
  children,
  className = "",
}: PanelShellProps) {
  return (
    <section
      data-panel-shell
      className={`overflow-hidden rounded-2xl border border-[var(--grid-line)] bg-[var(--sheet)] shadow-[0_1px_0_rgba(26,43,54,0.04)] max-sm:rounded-[1rem] max-sm:shadow-none ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--grid-line)] bg-[var(--sheet-header)] px-4 py-4 max-sm:py-3.5 sm:px-5">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {icon ? (
              <span className="text-[var(--brand)] max-sm:text-[var(--toss-blue)]" aria-hidden>
                {icon}
              </span>
            ) : null}
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--brand)] max-sm:font-sans max-sm:text-[1.2rem] max-sm:tracking-tight sm:text-2xl">
              {title}
            </h2>
          </div>
          {description ? (
            <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--ink-muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            {actions}
          </div>
        ) : null}
      </header>
      <div className="p-4 max-sm:px-3.5 max-sm:py-3.5 sm:p-5">{children}</div>
    </section>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--grid-line)] bg-[var(--sheet-header)]/50 px-4 py-12 text-center">
      <p className="text-base font-semibold text-[var(--ink)]">{title}</p>
      <p className="max-w-sm text-[15px] leading-relaxed text-[var(--ink-muted)]">
        {description}
      </p>
      {action}
    </div>
  );
}
