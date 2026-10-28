"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared father-friendly sheet chrome for voice / voice-file dialogs. */
export const VOICE_SHEET_CONTENT_CLASS =
  "flex max-h-[min(88dvh,36rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md max-sm:max-h-[min(92dvh,100%)]";

export const voiceFieldClass =
  "h-12 min-h-12 w-full touch-manipulation rounded-xl border border-[#c5ccd3] bg-white px-3 text-[16px] outline-none focus:border-[var(--toss-blue)] dark:border-[#4a5c52] dark:bg-[#24302a] sm:h-11 sm:min-h-11 sm:rounded-lg sm:text-[15px]";

export const voiceDateClass =
  "h-12 min-h-12 w-full touch-manipulation rounded-xl border border-[#c5ccd3] bg-white px-2 text-[16px] dark:border-[#4a5c52] dark:bg-[#24302a] sm:h-11 sm:min-h-11 sm:rounded-lg sm:text-[14px]";

export function VoiceSheetHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 space-y-1 border-b border-[#e8ecf0] px-4 pb-3 pt-4 pr-12 dark:border-[#2a3530]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function VoiceSheetBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-4 py-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function VoiceSheetFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-row gap-2 border-t border-[#e8ecf0] bg-popover px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-[#2a3530]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Deadline: someday + stacked dates — avoids wrap/overlap on phone. */
export function VoiceDeadlineFields({
  someday,
  onSomedayToggle,
  startDate,
  targetDate,
  onStartChange,
  onEndChange,
  somedayTestId,
  startTestId,
  endTestId,
}: {
  someday: boolean;
  onSomedayToggle: () => void;
  startDate: string;
  targetDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  somedayTestId: string;
  startTestId: string;
  endTestId: string;
}) {
  return (
    <div className="space-y-2.5">
      <button
        type="button"
        {...{ [somedayTestId]: "" }}
        aria-pressed={someday}
        onClick={onSomedayToggle}
        className={`h-11 min-h-11 w-full touch-manipulation rounded-xl border px-4 text-[15px] font-medium sm:h-10 sm:min-h-10 sm:w-auto sm:min-w-[6.5rem] sm:rounded-lg sm:text-[13.5px] ${
          someday
            ? "border-[var(--toss-blue)] bg-[#e8f1ff] text-[var(--toss-blue)]"
            : "border-[#c5ccd3] bg-white text-[var(--ink)] dark:border-[#4a5c52] dark:bg-[#24302a]"
        }`}
      >
        언젠가
      </button>
      {!someday ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-[var(--ink-muted)]">
            시작
            <input
              type="date"
              {...{ [startTestId]: "" }}
              value={startDate}
              onChange={(e) => onStartChange(e.target.value)}
              className={voiceDateClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-[var(--ink-muted)]">
            종료
            <input
              type="date"
              {...{ [endTestId]: "" }}
              value={targetDate}
              onChange={(e) => onEndChange(e.target.value)}
              className={voiceDateClass}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
