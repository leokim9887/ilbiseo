"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cheerDayIsoKst } from "@/lib/date-range";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "ilbiseo-daily-cheer-kst";
const IDX_KEY = "ilbiseo-daily-cheer-idx";

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
  "에이스 응원 도착! 할아버지, 파이팅!",
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
 * Once per cheer day: Asia/Seoul day boundary at 07:00 (not midnight).
 */
export function DailyCheerOverlay() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const nextIdxRef = useRef<number | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    const dayKey = cheerDayIsoKst();
    if (readShownDay() === dayKey) return;
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
    writeShownDay(cheerDayIsoKst());
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
      className="animate-fade-up fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(12,28,26,0.55)] px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="에이스 응원"
      data-daily-cheer
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-[22rem] sm:max-w-[24rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative overflow-hidden rounded-3xl border border-[#c9b27c]/45 bg-[linear-gradient(165deg,#f7f3ea_0%,#efe8d8_48%,#e7dfd0_100%)] px-5 pb-5 pt-6 shadow-[0_18px_48px_rgba(8,24,22,0.35)] sm:px-6 sm:pb-6 sm:pt-7">
          <div className="relative mx-auto flex w-fit flex-col items-center">
            <div
              className="relative mb-3 max-w-[18rem] rounded-2xl bg-white px-4 py-3 text-center shadow-sm ring-1 ring-[#163f39]/10"
              data-daily-cheer-bubble
            >
              <p className="font-sans text-[1.05rem] font-semibold leading-snug text-[#163f39] sm:text-[1.12rem]">
                {message}
              </p>
              <span
                className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-x-[10px] border-t-[12px] border-x-transparent border-t-white"
                aria-hidden
              />
            </div>

            <div className="relative size-[11.25rem] sm:size-[12.5rem]">
              <div
                className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_40%_35%,#f0e6c8_0%,#c9b27c_55%,#8a7340_100%)] opacity-90"
                aria-hidden
              />
              <div className="absolute inset-[7px] overflow-hidden rounded-full bg-[#163f39]/10 ring-2 ring-white/80">
                <Image
                  src="/ilbiseo-grandson-cheer.png"
                  alt="에이스"
                  width={640}
                  height={640}
                  priority
                  className="size-full object-cover object-center"
                  data-daily-cheer-face
                />
              </div>
            </div>
          </div>

          <Button
            type="button"
            size="lg"
            className="mt-5 min-h-12 w-full touch-manipulation text-[1.05rem] font-semibold sm:min-h-11"
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
