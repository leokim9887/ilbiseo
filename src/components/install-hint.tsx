"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "ilbiseo-install-dismissed-v2";
const DISMISS_DAYS = 21;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "android" | "desktop-win" | "desktop-mac" | "other";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/macintosh|mac os x/i.test(ua)) return "desktop-mac";
  if (/windows/i.test(ua)) return "desktop-win";
  return "other";
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    if (raw === "1") return true;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function platformCopy(platform: Platform): { title: string; body: string } {
  switch (platform) {
    case "ios":
      return {
        title: "아이폰·아이패드에 앱처럼 두기",
        body: "Safari에서 하단 공유(□↑) → 「홈 화면에 추가」를 누르세요. (Chrome 앱에서는 Safari로 열어 주세요.)",
      };
    case "android":
      return {
        title: "안드로이드에 앱 설치",
        body: "Chrome 메뉴(⋮) → 「앱 설치」또는 「홈 화면에 추가」. 설치하면 아이콘으로 전체 화면 실행됩니다.",
      };
    case "desktop-win":
      return {
        title: "Windows PC에 앱 설치",
        body: "Chrome 또는 Edge 주소창 오른쪽 설치(⊕/모니터) 아이콘, 또는 메뉴(⋮) → 「앱 설치」를 누르세요.",
      };
    case "desktop-mac":
      return {
        title: "Mac에 앱 설치",
        body: "Chrome 또는 Edge 주소창 오른쪽 설치 아이콘, 또는 메뉴 → 「앱 설치」. Safari는 「파일 → 독에 추가」를 쓸 수 있습니다.",
      };
    default:
      return {
        title: "홈 화면에 두면 앱처럼 씁니다",
        body: "브라우저 메뉴에서 「앱 설치」또는 「홈 화면에 추가」를 선택하세요. 할 일은 이 기기에 저장됩니다.",
      };
  }
}

export function InstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => {
    if (isStandalone()) return;
    if (wasDismissedRecently()) return;

    setPlatform(detectPlatform());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const t = window.setTimeout(() => {
      if (!isStandalone() && !wasDismissedRecently()) {
        setVisible(true);
      }
    }, 1800);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.clearTimeout(t);
    };
  }, []);

  if (!visible || isStandalone()) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  const copy = platformCopy(platform);

  return (
    <div
      role="region"
      aria-label="앱으로 설치"
      className="animate-fade-up sticky top-0 z-40 border-b border-[var(--grid-line)] bg-[var(--brand)]/95 px-3 py-2.5 text-[var(--primary-foreground)] backdrop-blur-sm sm:px-4"
      style={{ paddingTop: "max(0.65rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto flex w-full max-w-[110rem] items-start gap-3 px-2 sm:px-4">
        <div className="mt-0.5 rounded-md bg-white/15 p-1.5">
          {platform === "ios" ? (
            <Share className="size-4" />
          ) : (
            <Download className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <p className="font-semibold">{copy.title}</p>
          <p className="mt-0.5 text-[12px] text-white/85">{copy.body}</p>
          {deferred ? (
            <p className="mt-0.5 text-[12px] text-white/85">
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {deferred ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-9 bg-white text-[var(--brand)] hover:bg-white/90"
              onClick={() => void install()}
            >
              지금 설치
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
