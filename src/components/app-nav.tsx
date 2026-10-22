"use client";

import {
  CalendarDays,
  CheckSquare,
  ListTodo,
  Newspaper,
  Settings2,
} from "lucide-react";

export type MainView =
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
  { id: "todo", label: "할 일", short: "할 일", icon: ListTodo },
  { id: "done", label: "한 일", short: "한 일", icon: CheckSquare },
  { id: "calendar", label: "캘린더", short: "일정", icon: CalendarDays },
  { id: "briefing", label: "오늘 브리핑", short: "브리핑", icon: Newspaper },
  { id: "settings", label: "설정", short: "설정", icon: Settings2 },
];

interface AppNavProps {
  value: MainView;
  onChange: (v: MainView) => void;
  counts?: Partial<Record<MainView, number>>;
}

export function AppNav({ value, onChange, counts }: AppNavProps) {
  return (
    <>
      {/* Desktop / tablet: unchanged grid tabs */}
      <nav
        aria-label="주요 메뉴"
        className="hidden gap-1.5 sm:grid sm:grid-cols-3 lg:grid-cols-5"
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
              className={`flex min-h-[3.75rem] items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                active
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--primary-foreground)] shadow-sm"
                  : "border-[var(--grid-line)] bg-[var(--sheet)] text-[var(--ink)] hover:bg-[var(--row-hover)]"
              }`}
            >
              <Icon className="size-5 shrink-0 opacity-90" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug">
                  {item.label}
                </span>
                {typeof count === "number" ? (
                  <span
                    className={`block text-[13px] ${active ? "text-white/80" : "text-[var(--ink-muted)]"}`}
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

      {/* Phone: Toss-like bottom tab bar */}
      <nav
        aria-label="주요 메뉴"
        data-toss-tabbar
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--grid-line)] bg-[var(--sheet)]/98 backdrop-blur-md sm:hidden"
        style={{
          paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5 gap-0 px-1 pt-1">
          {NAV.map((item) => {
            const active = value === item.id;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onChange(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`toss-press flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11.5px] font-semibold leading-tight touch-manipulation transition-[color,background-color,opacity] duration-200 ${
                    active
                      ? "text-[var(--toss-blue)]"
                      : "text-[var(--toss-gray-500)]"
                  }`}
                >
                  <span
                    className={`flex size-8 items-center justify-center rounded-full transition-colors duration-200 ${
                      active ? "bg-[var(--toss-blue-soft)]" : "bg-transparent"
                    }`}
                    aria-hidden
                  >
                    <Icon
                      className={`size-[1.35rem] shrink-0 transition-transform duration-200 ${
                        active ? "scale-105" : "scale-100"
                      }`}
                      strokeWidth={active ? 2.35 : 1.9}
                    />
                  </span>
                  <span className="max-w-full truncate leading-none">
                    {item.short}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
