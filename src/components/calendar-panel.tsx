"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import {
  createMockCalendarEvents,
  formatCalendarWhen,
  looksLikeCalendarUrl,
} from "@/lib/calendar-data";
import { PanelShell, EmptyState } from "@/components/panel-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
} from "lucide-react";

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

export function CalendarPanel({
  events,
  onReplace,
  onAppend,
  banner,
}: CalendarPanelProps) {
  const [icsText, setIcsText] = useState("");
  /** Google OAuth /events errors — shown near connection status, not ICS */
  const [googleError, setGoogleError] = useState<string | null>(null);
  /** ICS import errors only */
  const [icsError, setIcsError] = useState<string | null>(null);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [busy, setBusy] = useState<"refresh" | "disconnect" | "ics" | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const autoFetched = useRef(false);

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
        setupHint: "상태 확인에 실패했습니다. ICS·mock으로 확인하세요.",
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
      // Full calendar sync (paginated; ~10y past → ~10y ahead). UI period filter still applies for display.
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
      // Never dump raw HTML next to ICS controls
      setGoogleError(
        /<\s*!doctype|<\s*html|Error 404 \(Not Found\)/i.test(msg)
          ? "Google 일정을 불러오지 못했습니다. 「새로고침」하거나 연결을 다시 해보세요. ICS는 선택 사항입니다."
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

  const loadMock = () => {
    // Optional demo only — not auto-loaded
    onReplace(createMockCalendarEvents());
    setGoogleError(null);
    setIcsError(null);
  };

  const importIcsViaServer = async (input: string, mode: "append" | "replace") => {
    setBusy("ics");
    setIcsError(null);
    const trimmed = input.trim();
    if (!trimmed) {
      setIcsError("붙여 넣을 ICS 내용 또는 iCal URL을 입력하세요.");
      setBusy(null);
      return;
    }
    try {
      const body = looksLikeCalendarUrl(trimmed)
        ? { url: trimmed }
        : { text: trimmed };
      const res = await fetch("/api/calendar/ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        error?: string;
        events?: CalendarEvent[];
        count?: number;
      };
      if (!res.ok) {
        throw new Error(json.error || "ICS 가져오기 실패");
      }
      const events = json.events ?? [];
      if (mode === "replace") onReplace(events);
      else onAppend(events);
      setIcsText("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ICS 가져오기 실패";
      setIcsError(
        /<\s*!doctype|<\s*html|Error 404 \(Not Found\)/i.test(msg)
          ? "ICS/URL을 가져오지 못했습니다. 주소를 확인하거나 파일로 넣어 보세요."
          : msg,
      );
    } finally {
      setBusy(null);
    }
  };

  const importIcs = () => void importIcsViaServer(icsText, "append");

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      await importIcsViaServer(text, "append");
    } catch (e) {
      setIcsError(e instanceof Error ? e.message : "파일 읽기 실패");
    }
  };

  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const configured = status?.configured ?? false;
  const connected = status?.connected ?? false;

  return (
    <PanelShell
      title="구글 캘린더"
      description="엑셀 할 일 표와 섞지 않습니다. 구글 연결 · ICS · mock으로 일정을 따로 봅니다."
      icon={<CalendarDays className="size-5" />}
      actions={
        <>
          {configured && connected ? (
            <>
              <Button
                type="button"
                size="lg"
                className="min-h-11"
                disabled={busy !== null}
                onClick={() => void refreshGoogle()}
              >
                {busy === "refresh" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {busy === "refresh" ? "전체 일정 불러오는 중…" : "전체 새로고침"}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="min-h-11"
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
              className="inline-flex h-11 min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[#217346] px-3 text-sm font-medium text-white hover:bg-[#1a5c38]"
            >
              <Link2 className="size-4" />
              Google 캘린더 연결
            </a>
          ) : (
            <Button type="button" size="lg" variant="ghost" className="min-h-11" disabled>
              OAuth 미설정
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="min-h-11"
            onClick={loadMock}
          >
            mock 샘플
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="min-h-11"
            onClick={() => fileRef.current?.click()}
          >
            ICS 파일
          </Button>
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
              Google 연결 상태 확인 중…
            </p>
          ) : configured && connected ? (
            <p className="text-[var(--ink)]">
              <span className="font-semibold text-[#217346]">연결됨</span>
              {status?.email ? ` · ${status.email}` : ""} · Google 일정{" "}
              <strong>전체</strong>(약 10년 전~후, 페이지 단위)를 불러옵니다.
              틀「구글 캘린더」기간 필터는 화면 표시만 줄입니다.
              {lastFetchCount != null ? (
                <>
                  {" "}
                  · 최근 동기화 <strong>{lastFetchCount}</strong>건
                </>
              ) : null}
            </p>
          ) : configured ? (
            <p className="text-[var(--ink)]">
              Google 설정은 되어 있습니다. 「Google 캘린더 연결」을 누르면
              로그인합니다.
            </p>
          ) : (
            <div className="space-y-2 text-[var(--ink)]">
              <p className="font-semibold">아직 Google 키가 없습니다</p>
              <p className="text-[var(--ink-muted)]">
                로컬/배포 환경에{" "}
                <code className="rounded bg-black/5 px-1">GOOGLE_CLIENT_ID</code>
                ,{" "}
                <code className="rounded bg-black/5 px-1">
                  GOOGLE_CLIENT_SECRET
                </code>
                ,{" "}
                <code className="rounded bg-black/5 px-1">
                  GOOGLE_REDIRECT_URI
                </code>
                를 넣으면 연결 버튼이 살아납니다.
              </p>
              {status?.missing?.length ? (
                <p className="text-xs text-[var(--ink-muted)]">
                  없는 값: {status.missing.join(", ")}
                </p>
              ) : null}
              <p className="text-xs text-[var(--ink-muted)]">
                설정 안내: 프로젝트 store{" "}
                <code>docs/google-calendar-setup.md</code> · 그전까지는 mock·ICS로
                확인하세요.
              </p>
            </div>
          )}
          {busy === "refresh" ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--ink-muted)]">
              <Loader2 className="size-4 animate-spin" />
              Google 전체 일정을 가져오는 중입니다. 일정이 많으면 잠시 걸릴 수
              있습니다…
            </p>
          ) : null}
          {googleError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {googleError}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/50 p-3">
          <p className="text-xs font-medium text-[var(--ink-muted)]">
            ICS 가져오기 · Google iCal URL (선택 · OAuth와 별도 · 서버가 대신
            받아옵니다)
          </p>
          <Textarea
            rows={3}
            className="font-mono text-xs"
            placeholder="https://calendar.google.com/calendar/ical/…/public/basic.ics 또는 BEGIN:VCALENDAR …"
            value={icsText}
            onChange={(e) => setIcsText(e.target.value)}
          />
          <p className="text-[11px] text-[var(--ink-muted)]">
            webcal:// 주소도 됩니다. 공개 URL이 안 되면 Google 설정의{" "}
            <strong>비밀 iCal 주소</strong>를 쓰세요.
          </p>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="min-h-11"
            disabled={!icsText.trim() || busy === "ics"}
            onClick={importIcs}
          >
            {busy === "ics" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                가져오는 중…
              </>
            ) : (
              "ICS / URL 가져오기"
            )}
          </Button>
          {icsError ? (
            <p className="text-sm text-destructive" role="alert">
              {icsError}
            </p>
          ) : null}
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            title="캘린더 일정이 없습니다"
            description="Google 연결·「mock 샘플」·ICS로 일정을 불러오세요. 할 일 엑셀 표와는 별도입니다."
            action={
              <Button type="button" size="lg" onClick={loadMock}>
                mock 샘플 넣기
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2" aria-label="캘린더 일정 목록">
            {sorted.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-[var(--grid-line)] border-l-[3px] border-l-[var(--accent-ongoing)] bg-[var(--sheet-header)]/30 px-3 py-3 sm:px-4"
              >
                <p className="text-[12px] font-medium text-[var(--brand)]">
                  {formatCalendarWhen(ev)}
                  {ev.end && !ev.allDay ? (
                    <span className="text-[var(--ink-muted)]">
                      {" "}
                      ~{" "}
                      {formatCalendarWhen({
                        ...ev,
                        start: ev.end,
                      })}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-base font-semibold text-[var(--ink)]">
                  {ev.title}
                </p>
                <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
                  {ev.calendarName ? `${ev.calendarName} · ` : ""}
                  {ev.notes || "메모 없음"} · 출처{" "}
                  {ev.source === "google"
                    ? "Google"
                    : ev.source === "ics"
                      ? "ICS"
                      : "mock"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}
