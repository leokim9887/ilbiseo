import { createId } from "./id";
import type { CalendarEvent } from "./types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 구글 캘린더 mock — 프로그램 할 일과 분리된 외부 일정 */
export function createMockCalendarEvents(): CalendarEvent[] {
  return [
    {
      id: createId(),
      title: "후보 인터뷰 — 김○○",
      start: `${todayIso()}T10:00:00`,
      end: `${todayIso()}T11:00:00`,
      allDay: false,
      notes: "mock 구글 캘린더",
      source: "mock",
      calendarName: "mock",
    },
    {
      id: createId(),
      title: "클라이언트 주간 싱크",
      start: `${inDays(1)}T15:00:00`,
      end: `${inDays(1)}T16:00:00`,
      allDay: false,
      notes: "",
      source: "mock",
      calendarName: "mock",
    },
    {
      id: createId(),
      title: "업계 세미나",
      start: inDays(5),
      end: null,
      allDay: true,
      notes: "참석 여부 검토",
      source: "mock",
      calendarName: "mock",
    },
  ];
}

export { parseIcsToEvents, importIcsFromInput, looksLikeCalendarUrl } from "./ics";

export function formatCalendarWhen(ev: CalendarEvent): string {
  if (ev.allDay || ev.start.length === 10) {
    return ev.start.slice(0, 10);
  }
  try {
    return new Date(ev.start).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ev.start;
  }
}
