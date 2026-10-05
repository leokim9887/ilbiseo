import type { CalendarEvent, Task } from "./types";
import {
  filterByPeriod,
  sortByPeriod,
  taskDateRange,
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
  const filteredTasks = filterByPeriod(
    tasks,
    opts.filterStart,
    opts.filterEnd,
  );
  const sortedTasks =
    opts.periodSort === "default"
      ? filteredTasks
      : sortByPeriod(filteredTasks, opts.periodSort);

  const rows: SheetRow[] = sortedTasks.map((task) => ({
    kind: "task",
    id: task.id,
    task,
    sortKey: taskSortKey(task),
  }));

  if (opts.includeCalendar) {
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
    rows.sort(
      (a, b) =>
        a.sortKey.localeCompare(b.sortKey) ||
        (a.kind === "calendar" && b.kind === "task" ? 1 : 0) ||
        (a.kind === "task" && b.kind === "calendar" ? -1 : 0),
    );
  }

  return rows;
}
