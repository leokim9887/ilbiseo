"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemeMode } from "@/components/theme-provider";

const OPTIONS: { mode: ThemeMode; label: string; hint: string }[] = [
  { mode: "light", label: "밝은 화면", hint: "낮에 보기 편함" },
  { mode: "dark", label: "어두운 화면", hint: "밤에 눈부심 적음" },
];

/** Father-friendly theme control for 설정 — large tap targets, Korean labels. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/60 px-4 py-4"
      data-theme-settings
    >
      <p className="text-[15px] font-semibold text-[var(--ink)]">화면 밝기</p>
      <div
        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
        role="group"
        aria-label="화면 밝기"
      >
        {OPTIONS.map((opt) => {
          const active = theme === opt.mode;
          const Icon = opt.mode === "light" ? Sun : Moon;
          return (
            <Button
              key={opt.mode}
              type="button"
              variant={active ? "default" : "outline"}
              size="lg"
              className={`min-h-12 justify-start gap-3 px-4 text-[15px] max-sm:rounded-xl ${
                active
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : ""
              }`}
              aria-pressed={active}
              data-theme-option={opt.mode}
              onClick={() => setTheme(opt.mode)}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span className="font-semibold leading-none">{opt.label}</span>
                <span
                  className={`text-[12px] font-normal leading-tight ${
                    active
                      ? "text-[var(--primary-foreground)]/85"
                      : "text-[var(--ink-muted)]"
                  }`}
                >
                  {opt.hint}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
