"use client";

import {
  CalendarDays,
  CheckSquare,
  Layers,
  ListTodo,
  Newspaper,
  Settings2,
} from "lucide-react";

export type MainView =
  | "unified"
  | "todo"
  | "done"
  | "calendar"
  | "briefing"
  | "settings";

const NAV: {
  id: MainView;
  label: string;
  short: string;
  icon: typeof ListTodo;
}[] = [
  { id: "unified", label: "통합", short: "통합", icon: Layers },
  { id: "todo", label: "할 일", short: "할 일", icon: ListTodo },
  { id: "done", label: "한 일", short: "한 일", icon: CheckSquare },
  { id: "calendar", label: "캘린더", short: "일정", icon: CalendarDays },
  { id: "briefing", label: "오늘 브리핑", short: "브리핑", icon: Newspaper },
  { id: "settings", label: "설정·엑셀", short: "설정", icon: Settings2 },
];

interface AppNavProps {
  value: MainView;
  onChange: (v: MainView) => void;
  counts?: Partial<Record<MainView, number>>;
}

export function AppNav({ value, onChange, counts }: AppNavProps) {
  return (
    <>
      <nav
        aria-label="주요 메뉴"
        className="hidden gap-1.5 sm:grid sm:grid-cols-3 lg:grid-cols-6"
      >
        {NAV.map((item) => {
          const active = value === item.id;
          const Icon = item.icon;
          const count = counts?.[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-current={active ? "page" : undefined}
              aria-label={
                typeof count === "number"
                  ? `${item.label} ${count}건`
                  : item.label
              }
              className={`flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--primary-foreground)] shadow-sm"
                  : "border-[var(--grid-line)] bg-[var(--sheet)] text-[var(--ink)] hover:bg-[var(--row-hover)]"
              }`}
            >
              <Icon className="size-5 shrink-0 opacity-90" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">
                  {item.label}
                </span>
                {typeof count === "number" ? (
                  <span
                    className={`block text-[11px] ${active ? "text-white/75" : "text-[var(--ink-muted)]"}`}
                    aria-hidden
                  >
                    {count}건
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </nav>

      <nav
        aria-label="주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--grid-line)] bg-[var(--sheet)]/95 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-6 gap-0.5 px-0.5 pt-1">
          {NAV.map((item) => {
            const active = value === item.id;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onChange(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[10px] font-medium ${
                    active
                      ? "bg-[var(--group-bg)] text-[var(--brand)]"
                      : "text-[var(--ink-muted)]"
                  }`}
                >
                  <Icon className="size-5" />
                  <span className="leading-none">{item.short}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
