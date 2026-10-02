"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "ilbiseo-welcome-seen-v2";

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
        업무·개인·과제·팀원 네 틀에서 할 일/한 일·체크리스트를 관리합니다. 구글
        캘린더는 별도 탭입니다. PC에서 「엑셀 파일 연결」하면 입력할 때마다
        로컬 xlsx가 갱신되고, 매일 08:00 브리핑은 업무 이메일을 넣으면
        발송을 준비합니다.
      </p>
      <div className="mt-3">
        <Button type="button" size="sm" onClick={close}>
          시작하기
        </Button>
      </div>
    </div>
  );
}
