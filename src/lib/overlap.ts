import type { CalendarEvent, Task } from "./types";
import { taskDateRange } from "./date-range";

export type DateWindow = { start: string; end: string };

/** Inclusive day-range overlap: A overlaps B iff startA ≤ endB AND endA ≥ startB. */
export function windowsOverlap(a: DateWindow, b: DateWindow): boolean {
  return a.start <= b.end && a.end >= b.start;
}

function eventWindow(ev: Pick<CalendarEvent, "start" | "end">): DateWindow {
  const start = ev.start.slice(0, 10);
  const end = (ev.end?.slice(0, 10) || start);
  return start <= end ? { start, end } : { start: end, end: start };
}

/**
 * Active unfinished tasks whose 마감목표 window overlaps `candidate`.
 * 「언젠가」/ undated candidate → no overlaps.
 * Checks all frames (caller passes every active task).
 */
export function findOverlappingActiveTasks(
  candidate: Pick<Task, "startDate" | "targetDate" | "kind">,
  tasks: readonly Task[],
  excludeId?: string,
): Task[] {
  const r = taskDateRange(candidate);
  if (!r) return [];
  return tasks.filter((t) => {
    if (excludeId && t.id === excludeId) return false;
    if (t.status !== "active") return false;
    const other = taskDateRange(t);
    if (!other) return false;
    return windowsOverlap(r, other);
  });
}

/** Optional: Google/mock/ICS events overlapping the candidate window. */
export function findOverlappingCalendarEvents(
  candidate: Pick<Task, "startDate" | "targetDate" | "kind">,
  events: readonly CalendarEvent[],
): CalendarEvent[] {
  const r = taskDateRange(candidate);
  if (!r) return [];
  return events.filter((ev) => windowsOverlap(r, eventWindow(ev)));
}

/**
 * Short Korean confirm copy for father UX.
 * Returns null when there is nothing to warn about.
 */
export function buildOverlapConfirmMessage(
  taskTitles: string[],
  calendarTitles: string[] = [],
): string | null {
  if (taskTitles.length === 0 && calendarTitles.length === 0) return null;
  const lines: string[] = ["겹치는 일정이 있습니다."];
  for (const t of taskTitles.slice(0, 5)) {
    lines.push(`· ${t || "(제목 없음)"}`);
  }
  if (taskTitles.length > 5) {
    lines.push(`· 외 ${taskTitles.length - 5}건`);
  }
  if (calendarTitles.length > 0) {
    lines.push("캘린더:");
    for (const t of calendarTitles.slice(0, 3)) {
      lines.push(`· ${t || "(제목 없음)"}`);
    }
    if (calendarTitles.length > 3) {
      lines.push(`· 외 ${calendarTitles.length - 3}건`);
    }
  }
  lines.push("", "그래도 저장할까요?");
  return lines.join("\n");
}

/**
 * Warn (confirm) if the new deadline overlaps other active tasks
 * (and optionally calendar events). Returns true to proceed.
 * Someday / undated → always true (no check).
 */
export function confirmNoBlockingOverlap(opts: {
  candidate: Pick<Task, "startDate" | "targetDate" | "kind">;
  activeTasks: readonly Task[];
  excludeId?: string;
  calendarEvents?: readonly CalendarEvent[];
}): boolean {
  const tasks = findOverlappingActiveTasks(
    opts.candidate,
    opts.activeTasks,
    opts.excludeId,
  );
  const events = opts.calendarEvents
    ? findOverlappingCalendarEvents(opts.candidate, opts.calendarEvents)
    : [];
  const msg = buildOverlapConfirmMessage(
    tasks.map((t) => t.title.trim()),
    events.map((e) => e.title.trim()),
  );
  if (!msg) return true;
  if (typeof window === "undefined") return true;
  return window.confirm(msg);
}
