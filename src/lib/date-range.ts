import type { Task } from "./types";

/** YYYY-MM-DD today in local time */
export function todayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD today in Asia/Seoul (KST) — for 마감목표 min / 지난 일정 */
export function todayIsoKst(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayIso(dt);
}

/** Monday–Sunday week containing `iso` (local). */
export function weekRangeContaining(iso: string): { start: string; end: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0 Sun
  const toMon = day === 0 ? -6 : 1 - day;
  const start = addDaysIso(iso, toMon);
  const end = addDaysIso(start, 6);
  return { start, end };
}

export function monthRangeContaining(iso: string): { start: string; end: string } {
  const [y, m] = iso.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

/** Effective [start, end] for a task. Single-date → both ends that day. */
export function taskDateRange(
  task: Pick<Task, "startDate" | "targetDate">,
): { start: string; end: string } | null {
  const start = task.startDate?.trim() || null;
  const end = task.targetDate?.trim() || null;
  if (!start && !end) return null;
  if (start && end) {
    return start <= end ? { start, end } : { start: end, end: start };
  }
  const only = (start || end)!;
  return { start: only, end: only };
}

/**
 * Active task whose deadline window is already past.
 * Uses taskDateRange: end day (or sole date) before today → overdue.
 * Undated tasks are never overdue.
 */
export function isPastUnfinishedTask(
  task: Pick<Task, "status" | "startDate" | "targetDate">,
  today: string = todayIsoKst(),
): boolean {
  if (task.status !== "active") return false;
  const r = taskDateRange(task);
  if (!r) return false;
  return r.end < today;
}

/**
 * Overlap rule: row shows if its [시작, 종료] overlaps filter [from, to].
 * (taskStart ≤ filterEnd) AND (taskEnd ≥ filterStart)
 * Undated rows are hidden when a period filter is active.
 */
export function overlapsPeriod(
  task: Pick<Task, "startDate" | "targetDate">,
  filterStart: string,
  filterEnd: string,
): boolean {
  const r = taskDateRange(task);
  if (!r) return false;
  const fs = filterStart <= filterEnd ? filterStart : filterEnd;
  const fe = filterStart <= filterEnd ? filterEnd : filterStart;
  return r.start <= fe && r.end >= fs;
}

/** Display in 마감목표 cell / xlsx — e.g. `2026-09-01 ~ 2026-09-30` */
export function formatDeadlineRange(
  task: Pick<Task, "startDate" | "targetDate">,
): string {
  const r = taskDateRange(task);
  if (!r) return "";
  if (r.start === r.end) return r.start;
  return `${r.start} ~ ${r.end}`;
}

export type PeriodSort = "default" | "start" | "end";

export function sortByPeriod(tasks: Task[], mode: PeriodSort): Task[] {
  if (mode === "default") return tasks;
  const keyed = tasks.map((t, i) => {
    const r = taskDateRange(t);
    const key =
      mode === "start"
        ? (r?.start ?? "9999-12-31")
        : (r?.end ?? "9999-12-31");
    return { t, key, i };
  });
  keyed.sort(
    (a, b) => a.key.localeCompare(b.key) || a.i - b.i,
  );
  return keyed.map((x) => x.t);
}

export function filterByPeriod(
  tasks: Task[],
  filterStart: string | null,
  filterEnd: string | null,
): Task[] {
  if (!filterStart && !filterEnd) return tasks;
  const fs = filterStart || filterEnd!;
  const fe = filterEnd || filterStart!;
  return tasks.filter((t) => overlapsPeriod(t, fs, fe));
}
