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
      <p className="mt-1 text-[14px] leading-relaxed text-[var(--ink-muted)]">
        밝은 화면 · 어두운 화면을 고르면 이 기기에서 기억합니다. 처음에는
        휴대폰·컴퓨터 설정을 따릅니다.
      </p>
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
              className={`min-h-12 justify-start gap-3 px-4 text-[15px] ${
                active
                  ? "bg-[var(--brand)] text-[var(--primary-foreground)] hover:bg-[var(--brand)]"
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
