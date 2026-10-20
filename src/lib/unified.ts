import type { CalendarEvent, Task } from "./types";
import { CATEGORY_LABEL, KIND_LABEL } from "./types";
import {
  filterByPeriod,
  formatDeadlineRange,
  overlapsPeriod,
  taskDateRange,
  todayIso,
} from "./date-range";
import { displayCalendarLabel, formatCalendarWhen } from "./calendar-data";
import { eventInclusiveDayRange } from "./calendar-span";

export type UnifiedSource = "task" | "calendar";

export type UnifiedItem = {
  id: string;
  source: UnifiedSource;
  title: string;
  /** Sort key YYYY-MM-DD or datetime */
  sortKey: string;
  whenLabel: string;
  badge: string;
  /** Left stripe / accent class hint */
  accent: "task" | "calendar";
  /** Extra line */
  meta: string;
  readOnly: boolean;
  importance?: number;
  urgency?: number;
  categoryLabel?: string;
  calendarName?: string;
  taskId?: string;
  eventId?: string;
};

function eventOverlapsPeriod(
  ev: CalendarEvent,
  filterStart: string,
  filterEnd: string,
): boolean {
  const { startDay, endDay } = eventInclusiveDayRange(ev);
  const fs = filterStart <= filterEnd ? filterStart : filterEnd;
  const fe = filterStart <= filterEnd ? filterEnd : filterStart;
  return startDay <= fe && endDay >= fs;
}

export function filterEventsByPeriod(
  events: CalendarEvent[],
  filterStart: string | null,
  filterEnd: string | null,
): CalendarEvent[] {
  if (!filterStart && !filterEnd) return events;
  const fs = filterStart || filterEnd!;
  const fe = filterEnd || filterStart!;
  return events.filter((e) => eventOverlapsPeriod(e, fs, fe));
}

function taskWhenLabel(task: Task): string {
  const label = formatDeadlineRange(task);
  if (!label) return "날짜 없음";
  return label;
}

function taskToItem(task: Task): UnifiedItem {
  const r = taskDateRange(task);
  const sortKey = r?.start ?? "9999-12-31";
  return {
    id: `task:${task.id}`,
    source: "task",
    title: task.title,
    sortKey: `${sortKey}T00:00:00`,
    whenLabel: taskWhenLabel(task),
    badge: "할 일",
    accent: "task",
    meta: [
      CATEGORY_LABEL[task.category],
      KIND_LABEL[task.kind],
      `중요 ${task.importance}`,
    ].join(" · "),
    readOnly: false,
    importance: task.importance,
    urgency: task.urgency,
    categoryLabel: CATEGORY_LABEL[task.category],
    taskId: task.id,
  };
}

function eventToItem(ev: CalendarEvent): UnifiedItem {
  return {
    id: `cal:${ev.id}`,
    source: "calendar",
    title: ev.title,
    sortKey: ev.start.length === 10 ? `${ev.start}T00:00:00` : ev.start,
    whenLabel: formatCalendarWhen(ev),
    badge: "캘린더",
    accent: "calendar",
    meta: [
      displayCalendarLabel(ev.calendarName),
      ev.notes && ev.notes !== "ICS import" ? ev.notes.slice(0, 60) : null,
      ev.source === "google" ? "Google" : ev.source === "ics" ? "ICS" : "mock",
      "읽기 전용",
    ]
      .filter(Boolean)
      .join(" · "),
    readOnly: true,
    calendarName: displayCalendarLabel(ev.calendarName) ?? undefined,
    eventId: ev.id,
  };
}

export type UnifiedSort = "time" | "importance";

/**
 * Build one coherent day/period list: program tasks + calendar events.
 * Calendar items are always read-only markers — never Excel-editable rows.
 */
export function buildUnifiedItems(
  tasks: Task[],
  events: CalendarEvent[],
  opts: {
    filterStart: string | null;
    filterEnd: string | null;
    sort: UnifiedSort;
    activeOnly?: boolean;
  },
): UnifiedItem[] {
  const active = opts.activeOnly
    ? tasks.filter((t) => t.status === "active")
    : tasks;
  const filteredTasks = filterByPeriod(
    active,
    opts.filterStart,
    opts.filterEnd,
  );
  const filteredEvents = filterEventsByPeriod(
    events,
    opts.filterStart,
    opts.filterEnd,
  );

  const items = [
    ...filteredTasks.map(taskToItem),
    ...filteredEvents.map(eventToItem),
  ];

  items.sort((a, b) => {
    if (opts.sort === "importance") {
      const ai = a.source === "task" ? (a.importance ?? 0) : 0;
      const bi = b.source === "task" ? (b.importance ?? 0) : 0;
      // tasks by importance first, then calendar by time; calendar after same-score tasks
      if (ai !== bi) return bi - ai;
    }
    return a.sortKey.localeCompare(b.sortKey) || a.title.localeCompare(b.title);
  });

  return items;
}

export function defaultTodayFilter(): { start: string; end: string } {
  const t = todayIso();
  return { start: t, end: t };
}

export { overlapsPeriod, eventOverlapsPeriod };
