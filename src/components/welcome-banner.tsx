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
    <div className="animate-fade-up rounded-2xl border border-[var(--grid-line)] bg-[var(--sheet)] px-5 py-5 shadow-[0_1px_0_rgba(26,43,54,0.04)] sm:px-6">
      <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--brand)]">
        일비서
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-muted)]">
        할 일·한 일 시트와 틀(업무·개인·과제·팀원)로 일정을 정리합니다.
      </p>
      <div className="mt-4">
        <Button type="button" size="lg" className="min-h-11" onClick={close}>
          시작하기
        </Button>
      </div>
    </div>
  );
}
