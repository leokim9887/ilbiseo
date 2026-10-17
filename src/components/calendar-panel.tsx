"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import { PanelShell, EmptyState } from "@/components/panel-shell";
import { MonthCalendarGrid } from "@/components/month-calendar-grid";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { todayIsoKst } from "@/lib/date-range";

interface CalendarPanelProps {
  events: CalendarEvent[];
  onReplace: (events: CalendarEvent[]) => void;
  onAppend: (events: CalendarEvent[]) => void;
  banner?: { kind: "ok" | "error"; text: string } | null;
}

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  missing: string[];
  setupHint: string;
};

function parseYearMonth(isoDay: string): { year: number; monthIndex: number } {
  const [y, m] = isoDay.split("-").map(Number);
  return { year: y, monthIndex: m - 1 };
}

export function CalendarPanel({
  events,
  onReplace,
  banner,
}: CalendarPanelProps) {
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [busy, setBusy] = useState<"refresh" | "disconnect" | null>(null);
  const autoFetched = useRef(false);
  const initial = parseYearMonth(todayIsoKst());
  const [year, setYear] = useState(initial.year);
  const [monthIndex, setMonthIndex] = useState(initial.monthIndex);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/google/status");
      const json = (await res.json()) as GoogleStatus;
      setStatus(json);
    } catch {
      setStatus({
        configured: false,
        connected: false,
        email: null,
        missing: [
          "GOOGLE_CLIENT_ID",
          "GOOGLE_CLIENT_SECRET",
          "GOOGLE_REDIRECT_URI",
        ],
        setupHint: "연결 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const [lastFetchCount, setLastFetchCount] = useState<number | null>(null);

  const refreshGoogle = useCallback(async () => {
    setBusy("refresh");
    setGoogleError(null);
    try {
      const res = await fetch("/api/google/events?full=1");
      const json = (await res.json()) as {
        error?: string;
        events?: CalendarEvent[];
        email?: string | null;
        count?: number;
        mode?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || "일정을 가져오지 못했습니다.");
      }
      const list = json.events ?? [];
      onReplace(list);
      setLastFetchCount(json.count ?? list.length);
      setStatus((s) =>
        s
          ? {
              ...s,
              connected: true,
              email: json.email ?? s.email,
            }
          : s,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "가져오기 실패";
      setGoogleError(
        /<\s*!doctype|<\s*html|Error 404 \(Not Found\)/i.test(msg)
          ? "Google 일정을 불러오지 못했습니다. 「새로고침」하거나 연결을 다시 해보세요."
          : msg,
      );
    } finally {
      setBusy(null);
    }
  }, [onReplace]);

  useEffect(() => {
    if (!status?.connected || autoFetched.current) return;
    autoFetched.current = true;
    void refreshGoogle();
  }, [status?.connected, refreshGoogle]);

  const disconnect = async () => {
    setBusy("disconnect");
    setGoogleError(null);
    try {
      await fetch("/api/google/disconnect", { method: "POST" });
      autoFetched.current = false;
      await loadStatus();
    } catch (e) {
      setGoogleError(e instanceof Error ? e.message : "연결 해제 실패");
    } finally {
      setBusy(null);
    }
  };

  const goPrevMonth = () => {
    setMonthIndex((m) => {
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  };

  const goNextMonth = () => {
    setMonthIndex((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  };

  const goToday = () => {
    const t = parseYearMonth(todayIsoKst());
    setYear(t.year);
    setMonthIndex(t.monthIndex);
  };

  const changeYearMonth = (nextYear: number, nextMonthIndex: number) => {
    setYear(nextYear);
    setMonthIndex(nextMonthIndex);
  };

  const monthPrefix = useMemo(() => {
    const m = String(monthIndex + 1).padStart(2, "0");
    return `${year}-${m}`;
  }, [year, monthIndex]);

  const monthEventCount = useMemo(
    () =>
      events.filter((ev) => {
        const start = ev.start.slice(0, 10);
        const end = (ev.end?.slice(0, 10) || start);
        const monthStart = `${monthPrefix}-01`;
        const last = new Date(year, monthIndex + 1, 0).getDate();
        const monthEnd = `${monthPrefix}-${String(last).padStart(2, "0")}`;
        return start <= monthEnd && end >= monthStart;
      }).length,
    [events, monthPrefix, year, monthIndex],
  );

  const configured = status?.configured ?? false;
  const connected = status?.connected ?? false;

  return (
    <PanelShell
      title="구글 캘린더"
      icon={<CalendarDays className="size-5" />}
      actions={
        <>
          {configured && connected ? (
            <>
              <Button
                type="button"
                size="lg"
                className="min-h-12 w-full touch-manipulation sm:min-h-11 sm:w-auto"
                disabled={busy !== null}
                onClick={() => void refreshGoogle()}
              >
                {busy === "refresh" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {busy === "refresh" ? "불러오는 중…" : "새로고침"}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="min-h-12 w-full touch-manipulation sm:min-h-11 sm:w-auto"
                disabled={busy !== null}
                onClick={() => void disconnect()}
              >
                <Link2Off className="size-4" />
                연결 해제
              </Button>
            </>
          ) : configured ? (
            <a
              href="/api/google/auth"
              className="inline-flex h-12 min-h-12 w-full touch-manipulation items-center justify-center gap-1.5 rounded-lg bg-[#217346] px-3 text-sm font-medium text-white hover:bg-[#1a5c38] sm:h-11 sm:min-h-11 sm:w-auto"
            >
              <Link2 className="size-4" />
              Google 캘린더 연결
            </a>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        {banner ? (
          <p
            className={`rounded-xl border px-4 py-3 text-sm ${
              banner.kind === "ok"
                ? "border-[#217346]/30 bg-[#217346]/10 text-[#1a5c38]"
                : "border-destructive/30 bg-destructive/5 text-destructive"
            }`}
            role="status"
          >
            {banner.text}
          </p>
        ) : null}

        <div className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/40 px-4 py-3 text-sm">
          {statusLoading ? (
            <p className="flex items-center gap-2 text-[var(--ink-muted)]">
              <Loader2 className="size-4 animate-spin" />
              연결 확인 중…
            </p>
          ) : configured && connected ? (
            <p className="text-[var(--ink)]">
              <span className="font-semibold text-[#217346]">연결됨</span>
              {status?.email ? ` · ${status.email}` : ""}
              {lastFetchCount != null ? ` · ${lastFetchCount}건` : null}
              {` · 이 달 ${monthEventCount}건`}
            </p>
          ) : configured ? (
            <p className="text-[var(--ink)]">연결을 누르면 로그인합니다.</p>
          ) : (
            <p className="text-[var(--ink-muted)]">
              Google 캘린더 연결을 준비 중입니다. 잠시 후 다시 확인해 주세요.
            </p>
          )}
          {busy === "refresh" ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-muted)]">
              <Loader2 className="size-4 animate-spin" />
              일정을 가져오는 중…
            </p>
          ) : null}
          {googleError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {googleError}
            </p>
          ) : null}
        </div>

        {events.length === 0 ? (
          <EmptyState
            title="캘린더 일정이 없습니다"
            description={
              configured
                ? "연결하면 일정이 여기에 보입니다."
                : "잠시 후 다시 확인해 주세요."
            }
            action={
              configured && !connected ? (
                <a
                  href="/api/google/auth"
                  className="inline-flex h-11 min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-lg bg-[#217346] px-4 text-sm font-medium text-white hover:bg-[#1a5c38]"
                >
                  <Link2 className="size-4" />
                  Google 캘린더 연결
                </a>
              ) : undefined
            }
          />
        ) : (
          <MonthCalendarGrid
            events={events}
            year={year}
            monthIndex={monthIndex}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
            onGoToday={goToday}
            onChangeYearMonth={changeYearMonth}
          />
        )}
      </div>
    </PanelShell>
  );
}
