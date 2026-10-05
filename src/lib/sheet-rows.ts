import type { CalendarEvent, Task } from "./types";
import {
  filterByPeriod,
  sortByPeriod,
  taskDateRange,
  todayIso,
} from "./date-range";
import { filterEventsByPeriod } from "./unified";

export type SheetRow =
  | { kind: "task"; id: string; task: Task; sortKey: string }
  | { kind: "calendar"; id: string; event: CalendarEvent; sortKey: string };

function taskSortKey(task: Task): string {
  const r = taskDateRange(task);
  if (!r) return "9999-12-31T23:59:59";
  return r.start.length === 10 ? `${r.start}T12:00:00` : r.start;
}

function eventSortKey(ev: CalendarEvent): string {
  if (ev.start.length === 10) return `${ev.start}T00:00:00`;
  return ev.start;
}

export function formatEventDeadline(ev: CalendarEvent): string {
  const startDay = ev.start.slice(0, 10);
  const endDay = ev.end?.slice(0, 10) || startDay;
  if (ev.allDay || ev.start.length === 10) {
    if (startDay === endDay) return startDay;
    return `${startDay} ~ ${endDay}`;
  }
  const startTime = ev.start.includes("T") ? ev.start.slice(11, 16) : "";
  const endTime =
    ev.end && ev.end.includes("T") ? ev.end.slice(11, 16) : "";
  if (startDay === endDay && startTime) {
    return `${startDay} ${startTime}${endTime ? `~${endTime}` : ""}`;
  }
  return `${startDay} ~ ${endDay}`;
}

export function calendarListUpTitle(ev: CalendarEvent): string {
  const loc =
    ev.notes &&
    ev.notes !== "ICS import" &&
    !ev.notes.startsWith("mock") &&
    ev.notes.length < 80
      ? ev.notes
      : "";
  const base = `[캘린더] ${ev.title}`;
  return loc ? `${base} · ${loc}` : base;
}

/** Events on/after fromDay (inclusive). */
export function eventsFromDay(
  events: CalendarEvent[],
  fromDay: string,
): CalendarEvent[] {
  return events.filter((e) => {
    const end = (e.end?.slice(0, 10) || e.start.slice(0, 10));
    return end >= fromDay;
  });
}

/** Events that touch a single calendar day. */
export function eventsOnDay(
  events: CalendarEvent[],
  day: string,
): CalendarEvent[] {
  return events.filter((e) => {
    const start = e.start.slice(0, 10);
    const end = e.end?.slice(0, 10) || start;
    return start <= day && end >= day;
  });
}

/** Program-task-only rows for a normal 틀. */
export function buildTaskOnlyRows(
  tasks: Task[],
  opts: {
    filterStart: string | null;
    filterEnd: string | null;
    periodSort: "default" | "start" | "end";
  },
): SheetRow[] {
  const filtered = filterByPeriod(
    tasks,
    opts.filterStart,
    opts.filterEnd,
  );
  const sorted =
    opts.periodSort === "default"
      ? filtered
      : sortByPeriod(filtered, opts.periodSort);
  return sorted.map((task) => ({
    kind: "task" as const,
    id: task.id,
    task,
    sortKey: taskSortKey(task),
  }));
}

/** Google Calendar 틀 — calendar events only (기간 시작~종료; 비어 있으면 오늘부터). */
export function buildGcalFrameRows(
  events: CalendarEvent[],
  opts: {
    rangeStart?: string | null;
    rangeEnd?: string | null;
  },
): SheetRow[] {
  const hasRange = Boolean(opts.rangeStart || opts.rangeEnd);
  let list: CalendarEvent[];
  if (!hasRange) {
    list = eventsFromDay(events, todayIso());
  } else {
    const fs = opts.rangeStart || opts.rangeEnd || todayIso();
    const fe = opts.rangeEnd || opts.rangeStart || fs;
    list = filterEventsByPeriod(events, fs, fe);
  }
  return [...list]
    .sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))
    .map((event) => ({
      kind: "calendar" as const,
      id: `cal:${event.id}`,
      event,
      sortKey: eventSortKey(event),
    }));
}

/** @deprecated Prefer buildTaskOnlyRows / buildGcalFrameRows */
export function buildTodoSheetRows(
  tasks: Task[],
  events: CalendarEvent[],
  opts: {
    filterStart: string | null;
    filterEnd: string | null;
    periodSort: "default" | "start" | "end";
    includeCalendar: boolean;
  },
): SheetRow[] {
  if (!opts.includeCalendar) {
    return buildTaskOnlyRows(tasks, opts);
  }
  const rows = buildTaskOnlyRows(tasks, opts);
  const filteredEvents = filterEventsByPeriod(
    events,
    opts.filterStart,
    opts.filterEnd,
  );
  for (const event of filteredEvents) {
    rows.push({
      kind: "calendar",
      id: `cal:${event.id}`,
      event,
      sortKey: eventSortKey(event),
    });
  }
  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return rows;
}
