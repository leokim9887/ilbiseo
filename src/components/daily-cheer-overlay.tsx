"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cheerDayIsoKst } from "@/lib/date-range";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "ilbiseo-daily-cheer-kst";
const IDX_KEY = "ilbiseo-daily-cheer-idx";

/**
 * QA / TEMP toggle for Ace daily cheer (keep `false` in production).
 * `true`  → show overlay on every page refresh/load (ignore 07:00 KST day gate).
 * `false` → once per cheer day via `cheerDayIsoKst()` + localStorage (07:00 Asia/Seoul).
 */
const FORCE_CHEER_EVERY_LOAD = false;

/** Father-friendly rotating pool — Ace cheering grandpa. */
export const CHEER_MESSAGES = [
  "할아버지, 오늘도 화이팅이에요!",
  "할아버지 최고! 오늘 하루도 힘차게 가요!",
  "에이스가 응원해요. 언제나 화이팅!",
  "할아버지, 오늘 할 일도 잘 해내실 거예요!",
  "씩씩한 할아버지! 에이스가 옆에서 응원할게요.",
  "오늘도 건강하게, 천천히, 화이팅!",
  "할아버지 미소가 제일 좋아요. 오늘도 화이팅!",
  "할 일 하나하나, 에이스가 응원합니다!",
  "할아버지, 잠시 쉬어도 괜찮아요. 그래도 화이팅!",
  "오늘 하루도 든든한 할아버지! 화이팅입니다!",
  "에이스 응원 도착! 할아버지, 화이팅!",
  "할아버지가 하면 다 잘돼요. 오늘도 화이팅!",
] as const;

function readIdx(
  storage: Pick<Storage, "getItem"> | null,
): number {
  try {
    const raw = storage?.getItem(IDX_KEY);
    const idx = Number.parseInt(raw ?? "0", 10);
    if (!Number.isFinite(idx) || idx < 0) return 0;
    return idx;
  } catch {
    return 0;
  }
}

/** Peek current rotation phrase without advancing (Strict Mode safe). */
export function peekCheerMessage(
  storage: Pick<Storage, "getItem"> | null = null,
): { message: string; nextIdx: number } {
  const store =
    storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  const idx = readIdx(store);
  return {
    message: CHEER_MESSAGES[idx % CHEER_MESSAGES.length]!,
    nextIdx: idx + 1,
  };
}

/** Advance rotation after a daily show is dismissed. */
export function commitCheerIndex(
  nextIdx: number,
  storage: Pick<Storage, "setItem"> | null = null,
): void {
  try {
    const store =
      storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    store?.setItem(IDX_KEY, String(nextIdx));
  } catch {
    /* ignore */
  }
}

function readShownDay(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeShownDay(day: string) {
  try {
    localStorage.setItem(STORAGE_KEY, day);
  } catch {
    /* private mode / quota — still dismiss for this session */
  }
}

/**
 * Ace cheer overlay — Ace face dominates; cheer copy floats over the real photo.
 * Once per cheer day: Asia/Seoul day boundary at 07:00 (not midnight).
 * Optional QA: set FORCE_CHEER_EVERY_LOAD = true to show on every refresh.
 */
export function DailyCheerOverlay() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const nextIdxRef = useRef<number | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    // Production: skip if already shown for this cheer day (07:00 KST boundary)
    if (!FORCE_CHEER_EVERY_LOAD) {
      const dayKey = cheerDayIsoKst();
      if (readShownDay() === dayKey) return;
    }
    openedRef.current = true;
    const { message: msg, nextIdx } = peekCheerMessage();
    nextIdxRef.current = nextIdx;
    setMessage(msg);
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    if (nextIdxRef.current != null) {
      commitCheerIndex(nextIdxRef.current);
      nextIdxRef.current = null;
    }
    if (!FORCE_CHEER_EVERY_LOAD) {
      writeShownDay(cheerDayIsoKst());
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="cheer-backdrop fixed inset-0 z-[80] flex items-end justify-center px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:items-center sm:px-6 sm:pb-6"
      role="dialog"
      aria-modal="true"
      aria-label="에이스 응원"
      data-daily-cheer
      onClick={dismiss}
    >
      {/* Portrait stage — Ace fills most of the surface; no dialog chrome */}
      <div
        className="cheer-stage relative flex w-[min(94vw,24rem)] flex-col items-center sm:w-[min(86vmin,36rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cheer-portrait relative aspect-square w-full">
          {/* Warm ambient light behind Ace */}
          <div className="cheer-glow pointer-events-none absolute inset-[-10%] rounded-full" aria-hidden />

          {/* Soft circular frame — real Ace pixels, soft vignette edge */}
          <div className="cheer-face-frame absolute inset-0 overflow-hidden rounded-full shadow-[0_28px_72px_rgba(0,0,0,0.5)]">
            <div className="cheer-face-alive absolute inset-0">
              <Image
                src="/ilbiseo-grandson-cheer.png?v=26"
                alt="에이스"
                width={640}
                height={640}
                priority
                unoptimized
                className="size-full object-cover object-center"
                data-daily-cheer-face
              />
            </div>
            {/* Soft edge fade into dark — not a white modal ring */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/10"
              style={{
                background:
                  "radial-gradient(circle at 50% 40%, transparent 48%, rgba(8,18,16,0.28) 68%, rgba(6,14,12,0.82) 100%)",
              }}
              aria-hidden
            />
          </div>

          {/* Cheer copy floats over Ace chest / lower face */}
          <div
            className="cheer-bubble absolute inset-x-[7%] bottom-[15%] z-10 sm:inset-x-[10%] sm:bottom-[16%]"
            data-daily-cheer-bubble
          >
            <p className="rounded-[1.25rem] bg-[rgba(10,22,20,0.74)] px-4 py-3 text-center font-sans text-[1.08rem] font-semibold leading-snug text-[#f7f3ea] shadow-[0_10px_28px_rgba(0,0,0,0.38)] backdrop-blur-[6px] ring-1 ring-[#c9b27c]/40 sm:px-5 sm:py-3.5 sm:text-[1.22rem]">
              {message}
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          className="cheer-cta mt-4 min-h-12 w-[min(100%,15rem)] touch-manipulation rounded-full text-[1.08rem] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.35)] max-sm:min-h-14 max-sm:rounded-xl max-sm:shadow-none sm:mt-5 sm:min-h-11"
          onClick={dismiss}
          data-daily-cheer-confirm
        >
          시작
        </Button>
      </div>
    </div>
  );
}
