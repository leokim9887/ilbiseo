"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "ilbiseo-welcome-seen-v2";

interface WelcomeBannerProps {
  onStart?: () => void;
}

export function WelcomeBanner({ onStart }: WelcomeBannerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
    onStart?.();
  };

  return (
    <div className="animate-fade-up rounded-2xl border border-[var(--grid-line)] bg-[var(--sheet)] px-4 py-4 shadow-[0_1px_0_rgba(26,43,54,0.04)] max-sm:rounded-[1rem] max-sm:shadow-none sm:rounded-[1.125rem] sm:px-6 sm:py-5 sm:shadow-none">
      <p className="font-sans text-2xl font-bold tracking-tight text-[var(--brand)] max-sm:text-[1.35rem]">
        일비서
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-muted)]">
        할 일과 일정을 한곳에서 정리합니다.
      </p>
      <div className="mt-4">
        <Button
          type="button"
          size="lg"
          className="min-h-12 w-full touch-manipulation rounded-xl max-sm:text-[1.02rem] sm:min-h-11 sm:w-auto"
          onClick={close}
        >
          시작하기
        </Button>
      </div>
    </div>
  );
}
