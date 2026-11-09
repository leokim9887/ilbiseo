import type { SheetRow } from "./sheet-rows";
import { isSomedayDeadline, taskDateRange } from "./date-range";
import type { Task } from "./types";

/** Sortable Excel columns (마감목표 · 중요도). */
export type ColumnSortKey = "deadline" | "importance";
export type ColumnSortDir = "asc" | "desc";
/** 마감목표 정렬 기준 — 시작일 vs 종료(마감)일 */
export type DeadlineBasis = "start" | "end";

export type ColumnSort = {
  key: ColumnSortKey;
  dir: ColumnSortDir;
  /** Only for key === "deadline". Default "start". */
  basis?: DeadlineBasis;
};

/**
 * Multi-level sort: first-selected = primary, second = secondary.
 * Max two levels (마감목표 + 중요도).
 */
export type ColumnSortStack = {
  primary: ColumnSort;
  secondary: ColumnSort | null;
};

export const SORTABLE_COL_KEYS: ColumnSortKey[] = [
  "deadline",
  "importance",
];

export function isSortableCol(key: string): key is ColumnSortKey {
  return (SORTABLE_COL_KEYS as string[]).includes(key);
}

function deadlineBasis(sort: ColumnSort): DeadlineBasis {
  return sort.basis === "end" ? "end" : "start";
}

/** Single-key cycle used when this key is the only active level. */
function cycleSameKey(current: ColumnSort): ColumnSort | null {
  if (current.key === "importance") {
    if (current.dir === "asc") return { key: "importance", dir: "desc" };
    return null;
  }
  // deadline: 시작▲ → 시작▼ → 마감▲ → 마감▼ → none
  const basis = deadlineBasis(current);
  if (basis === "start" && current.dir === "asc") {
    return { key: "deadline", dir: "desc", basis: "start" };
  }
  if (basis === "start" && current.dir === "desc") {
    return { key: "deadline", dir: "asc", basis: "end" };
  }
  if (basis === "end" && current.dir === "asc") {
    return { key: "deadline", dir: "desc", basis: "end" };
  }
  return null;
}

function freshSort(key: ColumnSortKey): ColumnSort {
  if (key === "deadline") {
    return { key: "deadline", dir: "asc", basis: "start" };
  }
  return { key: "importance", dir: "asc" };
}

/**
 * Header click: first-selected key = primary, second different key = secondary.
 * Clicking the same key cycles its direction/basis; cycling off promotes
 * secondary → primary (or clears).
 */
export function cycleColumnSortStack(
  current: ColumnSortStack | null,
  key: ColumnSortKey,
): ColumnSortStack | null {
  if (!current) {
    return { primary: freshSort(key), secondary: null };
  }

  const { primary, secondary } = current;

  if (primary.key === key) {
    const next = cycleSameKey(primary);
    if (!next) {
      return secondary
        ? { primary: secondary, secondary: null }
        : null;
    }
    return { primary: next, secondary };
  }

  if (secondary?.key === key) {
    const next = cycleSameKey(secondary);
    if (!next) return { primary, secondary: null };
    return { primary, secondary: next };
  }

  // Different key while primary is set → become / replace secondary
  return { primary, secondary: freshSort(key) };
}

/** @deprecated Prefer cycleColumnSortStack — kept for smoke/compat */
export function cycleColumnSort(
  current: ColumnSort | null,
  key: ColumnSortKey,
): ColumnSort | null {
  const stack = current
    ? ({ primary: current, secondary: null } as ColumnSortStack)
    : null;
  const next = cycleColumnSortStack(stack, key);
  return next?.primary ?? null;
}

/**
 * Empty / missing / 「언젠가」 values always sort **last** (both asc and desc),
 * so blank·언젠가 마감·중요 rows sink to the bottom consistently.
 */
function cmpEmptyLast(
  aEmpty: boolean,
  bEmpty: boolean,
  raw: number,
  dir: ColumnSortDir,
): number {
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return dir === "asc" ? raw : -raw;
}

function deadlineKey(
  row: SheetRow,
  basis: DeadlineBasis,
): { empty: boolean; value: string } {
  if (row.kind === "calendar") {
    if (basis === "end") {
      const end = (row.event.end || row.event.start).slice(0, 10);
      return { empty: !end, value: end || "" };
    }
    const v = row.event.start.slice(0, 10);
    return { empty: !v, value: v || "" };
  }
  if (row.kind === "past-separator" || row.kind === "group-separator") {
    return { empty: true, value: "" };
  }
  // 「언젠가」·날짜 없음 → always last (ASC/DESC)
  if (isSomedayDeadline(row.task)) {
    return { empty: true, value: "" };
  }
  const r = taskDateRange(row.task);
  const v = (basis === "end" ? r?.end : r?.start) ?? "";
  return { empty: !v, value: v };
}

function importanceKey(row: SheetRow): { empty: boolean; value: number } {
  if (
    row.kind === "calendar" ||
    row.kind === "past-separator" ||
    row.kind === "group-separator"
  ) {
    return { empty: true, value: 0 };
  }
  const v = row.task.importance;
  // 1–3 scale; treat missing/0 as empty
  if (v == null || Number.isNaN(v) || v <= 0) {
    return { empty: true, value: 0 };
  }
  return { empty: false, value: v };
}

export function compareSheetRows(
  a: SheetRow,
  b: SheetRow,
  sort: ColumnSort,
): number {
  if (sort.key === "deadline") {
    const basis = deadlineBasis(sort);
    const ka = deadlineKey(a, basis);
    const kb = deadlineKey(b, basis);
    const raw = ka.value.localeCompare(kb.value);
    return cmpEmptyLast(ka.empty, kb.empty, raw, sort.dir);
  }
  const ka = importanceKey(a);
  const kb = importanceKey(b);
  const raw = ka.value - kb.value;
  return cmpEmptyLast(ka.empty, kb.empty, raw, sort.dir);
}

export function applyColumnSort(
  rows: SheetRow[],
  sort: ColumnSort | null,
  secondary: ColumnSort | null = null,
): SheetRow[] {
  if (!sort) return rows;
  return [...rows]
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const primary = compareSheetRows(a.row, b.row, sort);
      if (primary !== 0) return primary;
      if (secondary) {
        const sec = compareSheetRows(a.row, b.row, secondary);
        if (sec !== 0) return sec;
      }
      return a.i - b.i;
    })
    .map((x) => x.row);
}

export function applyColumnSortStack(
  rows: SheetRow[],
  stack: ColumnSortStack | null,
): SheetRow[] {
  if (!stack) return rows;
  return applyColumnSort(rows, stack.primary, stack.secondary);
}

/**
 * Default 「할 일」order when no header sort is active:
 * 「등록일」newest-first (`createdAt` desc) — matches 「행 추가」newest-on-top.
 * Non-task rows keep relative position via stable index tie-break.
 */
export function applyDefaultRegisteredSort(rows: SheetRow[]): SheetRow[] {
  return [...rows]
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const ca = a.row.kind === "task" ? a.row.task.createdAt : "";
      const cb = b.row.kind === "task" ? b.row.task.createdAt : "";
      const byRegistered = cb.localeCompare(ca);
      if (byRegistered !== 0) return byRegistered;
      return a.i - b.i;
    })
    .map((x) => x.row);
}

/** Status hint when default 등록일 sort is in effect. */
export const DEFAULT_REGISTERED_SORT_LABEL = "등록일 최신순";

/**
 * Father rule — a 「할 일」row is ready for live 등록일/header sort only when
 * 할 일 + 마감목표 + 중요도 are all meaningfully filled.
 * Incomplete rows stay put (no mid-type jump).
 */
export function isTodoSortReady(task: Task): boolean {
  const titleOk = task.title.trim().length > 0;
  const deadlineOk =
    task.kind === "someday" ||
    Boolean(task.startDate?.trim()) ||
    Boolean(task.targetDate?.trim());
  const importanceOk =
    task.importance != null &&
    Number.isFinite(task.importance) &&
    task.importance >= 1 &&
    task.importance <= 3;
  return titleOk && deadlineOk && importanceOk;
}

/**
 * Keep deferred rows at their baseline indices; fill remaining slots with
 * the fully-sorted order of non-deferred rows.
 * Used so mid-edit / incomplete rows do not jump while siblings re-sort.
 */
export function applySortPreservingDeferred(
  baseline: SheetRow[],
  sortedFully: SheetRow[],
  isDeferred: (row: SheetRow) => boolean,
): SheetRow[] {
  if (baseline.length === 0) return [];
  if (baseline.length !== sortedFully.length) {
    // Fall back to sorted when sets diverge (filter/frame change).
    return sortedFully;
  }
  const n = baseline.length;
  const result: (SheetRow | null)[] = Array(n).fill(null);
  const deferredIds = new Set<string>();
  for (let i = 0; i < n; i++) {
    const row = baseline[i];
    if (!isDeferred(row)) continue;
    result[i] = row;
    deferredIds.add(row.id);
  }
  if (deferredIds.size === 0) return sortedFully;
  let slot = 0;
  for (const row of sortedFully) {
    if (deferredIds.has(row.id)) continue;
    while (slot < n && result[slot] !== null) slot++;
    if (slot >= n) break;
    result[slot] = row;
    slot++;
  }
  return result.map((r, i) => r ?? sortedFully[i] ?? baseline[i]);
}

/**
 * Rebuild task-row order using a previous visual id list.
 * New ids (e.g. 「행 추가」) keep their position from `rows` (usually index 0).
 * Non-task rows are dropped — callers re-apply sink after preserving.
 */
export function orderTaskRowsByIds(
  rows: SheetRow[],
  prevIds: readonly string[],
): SheetRow[] {
  const tasks = rows.filter((r) => r.kind === "task");
  if (tasks.length === 0) return [];
  if (prevIds.length === 0) return tasks;

  const byId = new Map(tasks.map((r) => [r.id, r]));
  const prevSet = new Set(prevIds);
  const knownOrdered: SheetRow[] = [];
  for (const id of prevIds) {
    const row = byId.get(id);
    if (row) knownOrdered.push(row);
  }
  if (knownOrdered.length === tasks.length) return knownOrdered;

  // Merge: new rows stay at their built index; known rows keep prior relative order.
  const out: SheetRow[] = [];
  let knownIdx = 0;
  for (const row of tasks) {
    if (!prevSet.has(row.id)) {
      out.push(row);
    } else {
      const next = knownOrdered[knownIdx++];
      if (next) out.push(next);
    }
  }
  while (knownIdx < knownOrdered.length) {
    out.push(knownOrdered[knownIdx++]);
  }
  return out;
}

function oneSortLabel(sort: ColumnSort): string {
  if (sort.key === "importance") {
    return `중요도 ${sort.dir === "asc" ? "오름차순▲" : "내림차순▼"}`;
  }
  const basis = deadlineBasis(sort) === "end" ? "마감" : "시작";
  return `마감목표(${basis}) ${sort.dir === "asc" ? "오름차순▲" : "내림차순▼"}`;
}

export function columnSortLabel(sort: ColumnSort | null): string {
  if (!sort) return "기본";
  return oneSortLabel(sort);
}

export function columnSortStackLabel(stack: ColumnSortStack | null): string {
  if (!stack) return "기본";
  if (!stack.secondary) return oneSortLabel(stack.primary);
  return `${oneSortLabel(stack.primary)} → ${oneSortLabel(stack.secondary)}`;
}

/** Which level (if any) this header key occupies in the stack. */
export function sortLevelForKey(
  stack: ColumnSortStack | null,
  key: ColumnSortKey,
): { level: 1 | 2; sort: ColumnSort } | null {
  if (!stack) return null;
  if (stack.primary.key === key) return { level: 1, sort: stack.primary };
  if (stack.secondary?.key === key) {
    return { level: 2, sort: stack.secondary };
  }
  return null;
}

export function deadlineBasisShort(sort: ColumnSort): string | null {
  if (sort.key !== "deadline") return null;
  return deadlineBasis(sort) === "end" ? "마감" : "시작";
}
