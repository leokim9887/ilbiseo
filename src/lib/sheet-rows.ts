import type { CalendarEvent, Task } from "./types";
import {
  filterByPeriod,
  isPastUnfinishedTask,
  sortByPeriod,
  taskDateRange,
  todayIso,
  todayIsoKst,
} from "./date-range";
import { eventInclusiveDayRange, eventOccursOnDay } from "./calendar-span";
import { filterEventsByPeriod } from "./unified";

export type SheetRow =
  | { kind: "task"; id: string; task: Task; sortKey: string }
  | { kind: "calendar"; id: string; event: CalendarEvent; sortKey: string }
  | { kind: "past-separator"; id: "past-separator" };

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
  const { startDay, endDay, multiDay } = eventInclusiveDayRange(ev);
  if (ev.allDay || ev.start.length === 10) {
    if (!multiDay) return startDay;
    return `${startDay} ~ ${endDay}`;
  }
  const startTime = ev.start.includes("T") ? ev.start.slice(11, 16) : "";
  const endTime =
    ev.end && ev.end.includes("T") ? ev.end.slice(11, 16) : "";
  if (!multiDay && startTime) {
    return `${startDay} ${startTime}${endTime ? `~${endTime}` : ""}`;
  }
  if (!multiDay) return startDay;
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

/** Events on/after fromDay (inclusive display end). */
export function eventsFromDay(
  events: CalendarEvent[],
  fromDay: string,
): CalendarEvent[] {
  return events.filter((e) => {
    const { endDay } = eventInclusiveDayRange(e);
    return endDay >= fromDay;
  });
}

/** Events that touch a single calendar day (inclusive display range). */
export function eventsOnDay(
  events: CalendarEvent[],
  day: string,
): CalendarEvent[] {
  return events.filter((e) => eventOccursOnDay(e, day));
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

/**
 * Push past unfinished tasks to the end of the sheet list and insert a
 * visual separator when both current and past rows exist.
 * Does not auto-move to 한 일 — only reorders within the same 틀 view.
 */
export function sinkPastSheetRowsLast(
  rows: SheetRow[],
  today: string = todayIsoKst(),
): SheetRow[] {
  const current: SheetRow[] = [];
  const past: SheetRow[] = [];
  for (const row of rows) {
    if (row.kind === "past-separator") continue;
    if (row.kind === "task" && isPastUnfinishedTask(row.task, today)) {
      past.push(row);
    } else {
      current.push(row);
    }
  }
  if (past.length === 0) return current;
  if (current.length === 0) return past;
  return [
    ...current,
    { kind: "past-separator", id: "past-separator" },
    ...past,
  ];
}

/**
 * Google Calendar 틀 — calendar events only.
 * - showAll: 가져온 일정 전체
 * - 기간 시작~종료: 구간에 겹치는 일정
 * - 둘 다 비움(기본): 오늘부터
 */
export function buildGcalFrameRows(
  events: CalendarEvent[],
  opts: {
    rangeStart?: string | null;
    rangeEnd?: string | null;
    showAll?: boolean;
  },
): SheetRow[] {
  const hasRange = Boolean(opts.rangeStart || opts.rangeEnd);
  let list: CalendarEvent[];
  if (opts.showAll && !hasRange) {
    list = events;
  } else if (!hasRange) {
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
  rows.sort((a, b) => {
    const ka = a.kind === "past-separator" ? "zzzz" : a.sortKey;
    const kb = b.kind === "past-separator" ? "zzzz" : b.sortKey;
    return ka.localeCompare(kb);
  });
  return rows;
}
