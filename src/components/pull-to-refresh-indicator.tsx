"use client";

import { Loader2, RefreshCw } from "lucide-react";

type Props = {
  pullPx: number;
  refreshing: boolean;
  threshold: number;
};

/** Fixed top indicator — phone only (parent hides on sm+). */
export function PullToRefreshIndicator({
  pullPx,
  refreshing,
  threshold,
}: Props) {
  if (pullPx <= 0 && !refreshing) return null;
  const progress = Math.min(1, pullPx / threshold);
  const armed = progress >= 1 || refreshing;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center sm:hidden"
      style={{
        paddingTop: "max(0.35rem, env(safe-area-inset-top))",
        transform: `translateY(${Math.max(0, pullPx - 8)}px)`,
        transition: refreshing || pullPx === 0 ? "transform 0.2s ease-out" : undefined,
      }}
      aria-live="polite"
      aria-busy={refreshing}
      data-pull-to-refresh
    >
      <div
        className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold shadow-md ${
          armed
            ? "border-[var(--brand)]/35 bg-[var(--sheet)] text-[var(--brand)]"
            : "border-[var(--grid-line)] bg-[var(--sheet)]/95 text-[var(--ink-muted)]"
        }`}
        style={{ opacity: Math.max(0.35, progress) }}
      >
        {refreshing ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw
            className="size-4"
            style={{ transform: `rotate(${progress * 180}deg)` }}
            aria-hidden
          />
        )}
        <span>
          {refreshing
            ? "새로고침 중…"
            : armed
              ? "놓으면 새로고침"
              : "아래로 당겨 새로고침"}
        </span>
      </div>
    </div>
  );
}
