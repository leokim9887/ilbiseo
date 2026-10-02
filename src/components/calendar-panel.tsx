"use client";

import { useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import {
  createMockCalendarEvents,
  formatCalendarWhen,
  parseIcsToEvents,
} from "@/lib/calendar-data";
import { PanelShell, EmptyState } from "@/components/panel-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays } from "lucide-react";

interface CalendarPanelProps {
  events: CalendarEvent[];
  onReplace: (events: CalendarEvent[]) => void;
  onAppend: (events: CalendarEvent[]) => void;
}

export function CalendarPanel({
  events,
  onReplace,
  onAppend,
}: CalendarPanelProps) {
  const [icsText, setIcsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasGoogle =
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) ||
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED);

  const loadMock = () => {
    onReplace(createMockCalendarEvents());
    setError(null);
  };

  const importIcs = () => {
    try {
      const parsed = parseIcsToEvents(icsText);
      onAppend(parsed);
      setIcsText("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ICS 가져오기 실패");
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      onAppend(parseIcsToEvents(text));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 읽기 실패");
    }
  };

  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <PanelShell
      title="구글 캘린더"
      description="프로그램 할 일·체크리스트와 섞지 않습니다. mock 또는 ICS로 확인할 수 있습니다."
      icon={<CalendarDays className="size-5" />}
      actions={
        <>
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
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
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
          {hasGoogle ? (
            <Button type="button" size="lg" className="min-h-11" disabled>
              Google 연결 (준비됨)
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              variant="ghost"
              className="min-h-11"
              disabled
            >
              OAuth 미설정
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/50 p-3">
          <Textarea
            rows={3}
            className="font-mono text-xs"
            placeholder="ICS 붙여넣기 (BEGIN:VCALENDAR …)"
            value={icsText}
            onChange={(e) => setIcsText(e.target.value)}
          />
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="min-h-11"
            disabled={!icsText.trim()}
            onClick={importIcs}
          >
            ICS 반영
          </Button>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            title="캘린더 일정이 없습니다"
            description="「mock 샘플」또는 ICS 파일로 일정을 불러오세요."
            action={
              <Button type="button" size="lg" onClick={loadMock}>
                mock 샘플 넣기
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {sorted.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-[var(--grid-line)] border-l-[3px] border-l-[var(--accent-ongoing)] bg-[var(--sheet-header)]/30 px-3 py-3 sm:px-4"
              >
                <p className="text-[12px] font-medium text-[var(--brand)]">
                  {formatCalendarWhen(ev)}
                </p>
                <p className="mt-0.5 text-base font-semibold text-[var(--ink)]">
                  {ev.title}
                </p>
                <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
                  {ev.notes || "메모 없음"} · 출처 {ev.source}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}
