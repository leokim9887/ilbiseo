"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "ilbiseo-welcome-seen";

export function WelcomeBanner() {
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
  };

  return (
    <div className="animate-fade-up rounded-lg border border-[var(--grid-line)] bg-[var(--sheet)] px-4 py-4 sm:px-5">
      <p className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--brand)]">
        아버지용 일비서
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-muted)]">
        로그인 없이 이 기기에서만 쓰는 개인 할 일 비서입니다. 스팟 → 지속 →
        언젠가 순으로 자동 정렬되고, 완료한 일은 기록으로 남깁니다. 홈 화면에
        추가해 두면 앱처럼 바로 열 수 있습니다.
      </p>
      <div className="mt-3">
        <Button type="button" size="sm" onClick={close}>
          시작하기
        </Button>
      </div>
    </div>
  );
}
