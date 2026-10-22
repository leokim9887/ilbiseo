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
  const activeIndex = Math.max(
    0,
    NAV.findIndex((item) => item.id === value),
  );

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

      {/* Phone: Toss-like bottom tab bar — springy indicator + press scale */}
      <nav
        aria-label="주요 메뉴"
        data-toss-tabbar
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--grid-line)] bg-[var(--sheet)]/98 backdrop-blur-xl sm:hidden"
        style={{
          paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          boxShadow: "0 -6px 24px rgba(25, 31, 40, 0.06)",
        }}
      >
        <div className="relative mx-auto max-w-lg px-1 pt-1.5">
          {/* Sliding top indicator — spring (outside grid so columns stay 5) */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1 top-0 z-[2] h-[2.5px] w-[20%] rounded-full bg-[var(--toss-blue)]"
            data-toss-tab-indicator
            style={{
              transform: `translateX(${activeIndex * 100}%)`,
              transition:
                "transform 0.38s cubic-bezier(0.34, 1.45, 0.64, 1)",
            }}
          />
          <ul className="grid grid-cols-5 gap-0">
            {NAV.map((item) => {
              const active = value === item.id;
              const Icon = item.icon;
              return (
                <li key={item.id} className="relative z-[1]">
                  <button
                    type="button"
                    onClick={() => onChange(item.id)}
                    aria-current={active ? "page" : undefined}
                    data-toss-tab={item.id}
                    data-toss-tab-active={active ? "1" : "0"}
                    className={`toss-press flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11.5px] font-semibold leading-tight touch-manipulation transition-[color,transform,opacity] duration-200 ${
                      active
                        ? "text-[var(--toss-blue)]"
                        : "text-[var(--toss-gray-500)]"
                    }`}
                  >
                    <span
                      className={`flex size-8 items-center justify-center rounded-full transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.34,1.45,0.64,1)] ${
                        active
                          ? "scale-110 bg-[var(--toss-blue-soft)]"
                          : "scale-100 bg-transparent"
                      }`}
                      aria-hidden
                    >
                      <Icon
                        className="size-[1.35rem] shrink-0"
                        strokeWidth={active ? 2.4 : 1.85}
                      />
                    </span>
                    <span className="max-w-full truncate leading-none tracking-tight">
                      {item.short}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </>
  );
}
