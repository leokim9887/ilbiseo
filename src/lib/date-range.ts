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

/**
 * Cheer “day” key in Asia/Seoul — boundary at 07:00 KST, not midnight.
 * Before 07:00 still counts as the previous cheer day; from 07:00 a new
 * window opens until the next 07:00.
 */
export function cheerDayIsoKst(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = pick("year");
  const m = pick("month");
  const day = pick("day");
  let hour = Number.parseInt(pick("hour"), 10);
  // Some engines report midnight as 24 with hourCycle quirks
  if (hour === 24) hour = 0;
  const calendarDay = `${y}-${m}-${day}`;
  if (!Number.isFinite(hour) || hour < 7) {
    return addDaysIso(calendarDay, -1);
  }
  return calendarDay;
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
  task: Pick<Task, "startDate" | "targetDate" | "kind">,
): { start: string; end: string } | null {
  // 「언젠가」= no specific deadline (null dates + kind someday)
  if (task.kind === "someday") return null;
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
 * Explicit 「언젠가」마감 — no scheduled window.
 * Prefer kind=someday; also treat fully undated rows as someday.
 */
export function isSomedayDeadline(
  task: Pick<Task, "kind" | "startDate" | "targetDate">,
): boolean {
  if (task.kind === "someday") return true;
  const start = task.startDate?.trim() || null;
  const end = task.targetDate?.trim() || null;
  return !start && !end;
}

/**
 * Active task whose 마감목표 **시작일** is before today (KST) → 「지난 일정」.
 * - Compare stored **startDate** (range A~B → A; single day → that day).
 * - Do **not** use taskDateRange’s swapped window — father tilde `~10/18`
 *   with today 10/19 stores start=today, end=10/18; that must stay **not** past.
 * - Start &lt; today → past (even if end is still in the future).
 * - Start === today or future → not past.
 * - 「언젠가」/ undated → never past.
 * Used after Excel 불러오기 and in normal 할 일 views (same 틀, bottom + separator).
 */
export function isPastUnfinishedTask(
  task: Pick<Task, "status" | "startDate" | "targetDate" | "kind">,
  today: string = todayIsoKst(),
): boolean {
  if (task.status !== "active") return false;
  if (isSomedayDeadline(task)) return false;
  const start =
    task.startDate?.trim() || task.targetDate?.trim() || null;
  if (!start) return false;
  return start < today;
}

/**
 * Overlap rule: row shows if its [시작, 종료] overlaps filter [from, to].
 * (taskStart ≤ filterEnd) AND (taskEnd ≥ filterStart)
 * Undated rows are hidden when a period filter is active.
 */
export function overlapsPeriod(
  task: Pick<Task, "startDate" | "targetDate" | "kind">,
  filterStart: string,
  filterEnd: string,
): boolean {
  const r = taskDateRange(task);
  if (!r) return false;
  const fs = filterStart <= filterEnd ? filterStart : filterEnd;
  const fe = filterStart <= filterEnd ? filterEnd : filterStart;
  return r.start <= fe && r.end >= fs;
}

/** Display in 마감목표 cell / xlsx — e.g. `2026-09-01 ~ 2026-09-30` or `언젠가` */
export function formatDeadlineRange(
  task: Pick<Task, "startDate" | "targetDate" | "kind">,
): string {
  if (isSomedayDeadline(task)) return "언젠가";
  const r = taskDateRange(task);
  if (!r) return "";
  if (r.start === r.end) return r.start;
  return `${r.start} ~ ${r.end}`;
}

/**
 * Excel date for a calendar day (UTC midnight).
 * Used so 「마감목표」 sorts as a real date in Excel AutoFilter.
 */
export function excelDateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Excel 「마감목표」:
 * - 단일일 → Excel Date(시작일) + yyyy-mm-dd (정렬용)
 * - 구간 → **텍스트** `YYYY-MM-DD ~ YYYY-MM-DD` (라운드트립 정확 — numFmt 리터럴 의존 제거)
 * - 「언젠가」→ 텍스트
 */
export function deadlineExcelParts(
  task: Pick<Task, "startDate" | "targetDate" | "kind">,
):
  | { kind: "someday"; value: string }
  | { kind: "empty"; value: "" }
  | { kind: "date"; value: Date; numFmt: string; start: string; end: string }
  | { kind: "rangeText"; value: string; start: string; end: string } {
  if (isSomedayDeadline(task)) {
    return { kind: "someday", value: "언젠가" };
  }
  const r = taskDateRange(task);
  if (!r) return { kind: "empty", value: "" };
  if (r.start === r.end) {
    return {
      kind: "date",
      value: excelDateFromIso(r.start),
      numFmt: "yyyy-mm-dd",
      start: r.start,
      end: r.end,
    };
  }
  // Plain text so import reads exact start+end (no TZ / numFmt loss)
  return {
    kind: "rangeText",
    value: `${r.start} ~ ${r.end}`,
    start: r.start,
    end: r.end,
  };
}

/**
 * Compact phone 마감 — keep year visible (YY.M.D), not MM/DD alone.
 * e.g. `26.10.16` or `26.10.1~26.10.30`
 */
export function formatDeadlineRangeCompact(
  task: Pick<Task, "startDate" | "targetDate" | "kind">,
): string {
  if (isSomedayDeadline(task)) return "언젠가";
  const r = taskDateRange(task);
  if (!r) return "";
  const short = (iso: string) => {
    const [y, m, d] = iso.split("-");
    const yy = y.length === 4 ? y.slice(2) : y;
    return `${yy}.${Number(m)}.${Number(d)}`;
  };
  if (r.start === r.end) return short(r.start);
  return `${short(r.start)}~${short(r.end)}`;
}

export type PeriodSort = "default" | "start" | "end";

export function sortByPeriod(tasks: Task[], mode: PeriodSort): Task[] {
  if (mode === "default") return tasks;
  const keyed = tasks.map((t, i) => {
    const r = taskDateRange(t);
    // 「언젠가」/ undated → after all dated tasks
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
