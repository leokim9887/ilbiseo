"use client";

import { useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import {
  createMockCalendarEvents,
  formatCalendarWhen,
  parseIcsToEvents,
} from "@/lib/calendar-data";
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
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--accent-ongoing)]/30 bg-[var(--sheet)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-base font-semibold text-[var(--brand)]">
              <CalendarDays className="size-4" />
              구글 캘린더 (별도 영역)
            </p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              프로그램 할 일·체크리스트와{" "}
              <strong className="text-[var(--ink)]">섞지 않고</strong> 따로
              보여 줍니다. OAuth 키가 없으면 mock/ICS로 확인하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={loadMock}>
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
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              ICS 파일
            </Button>
            {hasGoogle ? (
              <Button type="button" size="sm" disabled>
                Google 연결 (준비됨)
              </Button>
            ) : (
              <Button type="button" size="sm" variant="ghost" disabled>
                OAuth 미설정
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Textarea
            rows={3}
            className="font-mono text-xs"
            placeholder="ICS 붙여넣기 (BEGIN:VCALENDAR …)"
            value={icsText}
            onChange={(e) => setIcsText(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
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
      </div>

      {sorted.length === 0 ? (
        <div className="border border-dashed border-[var(--grid-line)] px-4 py-12 text-center text-sm text-[var(--ink-muted)]">
          캘린더 일정이 없습니다. mock 샘플 또는 ICS를 불러오세요.
        </div>
      ) : (
        <div className="overflow-x-auto border border-[var(--grid-line)] bg-[var(--sheet)]">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--sheet-header)] text-left text-[12px] font-semibold text-[var(--ink-muted)]">
                <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
                  언제
                </th>
                <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
                  일정 (캘린더)
                </th>
                <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
                  메모
                </th>
                <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
                  출처
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((ev) => (
                <tr key={ev.id} className="hover:bg-[var(--row-hover)]">
                  <td className="border-b border-[var(--grid-line)] px-3 py-2.5 whitespace-nowrap text-[var(--ink-muted)]">
                    {formatCalendarWhen(ev)}
                  </td>
                  <td className="border-b border-[var(--grid-line)] px-3 py-2.5 font-medium">
                    {ev.title}
                  </td>
                  <td className="border-b border-[var(--grid-line)] px-3 py-2.5 text-[var(--ink-muted)]">
                    {ev.notes || "—"}
                  </td>
                  <td className="border-b border-[var(--grid-line)] px-3 py-2.5 text-[12px] text-[var(--ink-muted)]">
                    {ev.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
