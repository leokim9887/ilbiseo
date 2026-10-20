"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cheerDayIsoKst } from "@/lib/date-range";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "ilbiseo-daily-cheer-kst";
const IDX_KEY = "ilbiseo-daily-cheer-idx";

/**
 * TEMP / TODO — QA toggle for Ace daily cheer.
 * `true`  → show overlay on every page refresh/load (ignore 07:00 KST day gate).
 * `false` → restore once-per-cheer-day via `cheerDayIsoKst()` + localStorage.
 * Revert to `false` after visual QA is done.
 */
const FORCE_CHEER_EVERY_LOAD = true;

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
 * Ace cheer overlay — rotating message + 시작.
 * Default: once per cheer day (Asia/Seoul 07:00 boundary).
 * TEMP: FORCE_CHEER_EVERY_LOAD shows on every refresh for QA.
 */
export function DailyCheerOverlay() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const nextIdxRef = useRef<number | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    // TEMP: skip day-boundary gate while FORCE_CHEER_EVERY_LOAD is true
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
    // TEMP: do not lock the cheer day while force-every-load QA is on
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
      className="cheer-backdrop fixed inset-0 z-[80] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="에이스 응원"
      data-daily-cheer
      onClick={dismiss}
    >
      <div
        className="cheer-card relative w-full max-w-[22.5rem] sm:max-w-[25rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative overflow-hidden rounded-[1.65rem] border border-[#c9b27c]/55 bg-[linear-gradient(168deg,#faf6ee_0%,#f0e8d6_42%,#e6dcc8_100%)] px-5 pb-5 pt-6 shadow-[0_22px_56px_rgba(8,24,22,0.42),0_0_0_1px_rgba(201,178,124,0.18)] sm:px-7 sm:pb-6 sm:pt-7">
          {/* Warm top wash — depth without clutter */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_50%_0%,rgba(201,178,124,0.28)_0%,transparent_70%)]"
            aria-hidden
          />

          <div className="relative mx-auto flex w-fit flex-col items-center">
            <p className="cheer-label mb-2.5 font-sans text-[0.72rem] font-semibold tracking-[0.14em] text-[#8a7340] sm:text-[0.75rem]">
              에이스의 응원
            </p>

            <div
              className="cheer-bubble relative mb-4 max-w-[19rem] rounded-2xl bg-white/95 px-4 py-3.5 text-center shadow-[0_6px_20px_rgba(22,63,57,0.08)] ring-1 ring-[#163f39]/12 sm:max-w-[20rem]"
              data-daily-cheer-bubble
            >
              <p className="font-sans text-[1.12rem] font-semibold leading-snug text-[#143832] sm:text-[1.2rem]">
                {message}
              </p>
              <span
                className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-x-[11px] border-t-[13px] border-x-transparent border-t-white/95"
                aria-hidden
              />
            </div>

            <div className="cheer-face relative size-[12rem] sm:size-[13.5rem]">
              {/* Soft warm glow — intentional presence, not purple */}
              <div className="cheer-glow absolute -inset-3 rounded-full" aria-hidden />
              <div
                className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_32%,#f3e7c4_0%,#c9b27c_52%,#7a6540_100%)] opacity-95 shadow-[0_10px_28px_rgba(22,63,57,0.22)]"
                aria-hidden
              />
              <div className="absolute inset-[8px] overflow-hidden rounded-full bg-[#163f39]/10 ring-[3px] ring-white/90">
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
            </div>
          </div>

          <Button
            type="button"
            size="lg"
            className="cheer-cta mt-6 min-h-12 w-full touch-manipulation text-[1.08rem] font-semibold shadow-[0_4px_14px_rgba(26,77,69,0.28)] sm:min-h-11"
            onClick={dismiss}
            data-daily-cheer-confirm
          >
            시작
          </Button>
        </div>
      </div>
    </div>
  );
}
