import { createId } from "./id";
import { eventInclusiveDayRange } from "./calendar-span";
import { formatDisplayDate, formatDisplayDateRange } from "./date-range";
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
      // Google all-day exclusive end (= start+1) → single day on start
      end: inDays(6),
      allDay: true,
      notes: "참석 여부 검토",
      source: "mock",
      calendarName: "mock",
    },
    {
      id: "mock-span-trip",
      title: "출장 (연속)",
      // True multi-day all-day: exclusive end → 4 inclusive days
      start: inDays(2),
      end: inDays(6),
      allDay: true,
      notes: "월간 연속 바 샘플",
      source: "mock",
      calendarName: "mock",
    },
    {
      id: "mock-span-timed",
      title: "집중 워크숍",
      start: `${inDays(8)}T09:00:00`,
      end: `${inDays(10)}T17:00:00`,
      allDay: false,
      notes: "timed multi-day span",
      source: "mock",
      calendarName: "mock",
    },
  ];
}

export { parseIcsToEvents, importIcsFromInput, looksLikeCalendarUrl } from "./ics";

/**
 * Calendar summary for todo/gcal list rows.
 * Hides Google account emails (e.g. goldage64@gmail.com) that often appear as
 * primary-calendar `summary`. Connection UI still shows status.email separately.
 */
export function displayCalendarLabel(name?: string | null): string | null {
  const n = name?.trim();
  if (!n) return null;
  if (n.includes("@")) return null;
  return n;
}

/**
 * When label for lists / Excel / briefing (father-facing `YY-MM-DD`).
 * Multi-day → one string with inclusive range, e.g. `26-10-14 ~ 26-10-21`.
 * Never expands to one row per day.
 */
export function formatCalendarWhen(ev: CalendarEvent): string {
  const range = eventInclusiveDayRange(ev);
  if (ev.allDay || ev.start.length === 10) {
    return formatDisplayDateRange(
      range.startDay,
      range.multiDay ? range.endDay : range.startDay,
    );
  }
  if (range.multiDay) {
    const startClock = formatClock(ev.start);
    const endClock = ev.end ? formatClock(ev.end) : "";
    if (endClock) {
      return `${formatDisplayDate(range.startDay)} ${startClock} ~ ${formatDisplayDate(range.endDay)} ${endClock}`;
    }
    return formatDisplayDateRange(range.startDay, range.endDay);
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

/** Events whose inclusive range overlaps [fromDay, toDay] (YYYY-MM-DD). */
export function filterCalendarEventsInWindow(
  events: readonly CalendarEvent[],
  fromDay: string,
  toDay: string,
): CalendarEvent[] {
  const fs = fromDay <= toDay ? fromDay : toDay;
  const fe = fromDay <= toDay ? toDay : fromDay;
  return events.filter((e) => {
    const { startDay, endDay } = eventInclusiveDayRange(e);
    return startDay <= fe && endDay >= fs;
  });
}

function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    const m = iso.match(/T(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : iso;
  }
}

function shortMd(isoDay: string): string {
  const [, m, d] = isoDay.slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * Day-detail panel time line: full useful when, no truncation.
 * Multi-day spans include the inclusive date span.
 */
export function formatCalendarDayDetailWhen(ev: CalendarEvent): string {
  const range = eventInclusiveDayRange(ev);
  if (ev.allDay || ev.start.length === 10) {
    if (range.multiDay) {
      return `종일 · ${shortMd(range.startDay)} ~ ${shortMd(range.endDay)}`;
    }
    return "종일";
  }
  const startClock = formatClock(ev.start);
  const endClock = ev.end ? formatClock(ev.end) : "";
  if (range.multiDay) {
    const endPart = endClock
      ? `${shortMd(range.endDay)} ${endClock}`
      : shortMd(range.endDay);
    return `${shortMd(range.startDay)} ${startClock} ~ ${endPart}`;
  }
  return endClock ? `${startClock} – ${endClock}` : startClock;
}
