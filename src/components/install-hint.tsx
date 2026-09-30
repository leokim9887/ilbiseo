"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "ilbiseo-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    setIos(isIos());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const t = window.setTimeout(() => {
      if (!isStandalone() && localStorage.getItem(DISMISS_KEY) !== "1") {
        setVisible(true);
      }
    }, 1200);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.clearTimeout(t);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="홈 화면에 추가"
      className="animate-fade-up sticky top-0 z-40 border-b border-[var(--grid-line)] bg-[var(--brand)] px-3 py-2.5 text-[var(--primary-foreground)] shadow-sm sm:px-4"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        <div className="mt-0.5 rounded-md bg-white/15 p-1.5">
          <Download className="size-4" />
        </div>
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <p className="font-semibold">홈 화면에 두면 앱처럼 씁니다</p>
          {ios ? (
            <p className="mt-0.5 text-[12px] text-white/85">
              Safari에서{" "}
              <Share className="inline size-3.5 align-[-2px]" aria-hidden />{" "}
              <strong>공유</strong> → <strong>홈 화면에 추가</strong>를 눌러
              주세요.
            </p>
          ) : deferred ? (
            <p className="mt-0.5 text-[12px] text-white/85">
              아래 버튼으로 설치하면 전체 화면으로 열립니다. 할 일은 이 폰에
              저장됩니다.
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-white/85">
              Chrome 메뉴(⋮) → <strong>앱 설치</strong> 또는{" "}
              <strong>홈 화면에 추가</strong>를 선택하세요.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {deferred ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="bg-white text-[var(--brand)] hover:bg-white/90"
              onClick={install}
            >
              설치
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            onClick={dismiss}
            aria-label="닫기"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
