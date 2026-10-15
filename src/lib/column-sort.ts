import type { SheetRow } from "./sheet-rows";
import { isSomedayDeadline, taskDateRange } from "./date-range";

/** Sortable Excel columns (마감목표 · 중요도). */
export type ColumnSortKey = "deadline" | "importance";
export type ColumnSortDir = "asc" | "desc";

export type ColumnSort = {
  key: ColumnSortKey;
  dir: ColumnSortDir;
};

export const SORTABLE_COL_KEYS: ColumnSortKey[] = [
  "deadline",
  "importance",
];

export function isSortableCol(key: string): key is ColumnSortKey {
  return (SORTABLE_COL_KEYS as string[]).includes(key);
}

/** none → asc → desc → none */
export function cycleColumnSort(
  current: ColumnSort | null,
  key: ColumnSortKey,
): ColumnSort | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
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

function deadlineKey(row: SheetRow): { empty: boolean; value: string } {
  if (row.kind === "calendar") {
    const v = row.event.start.slice(0, 10);
    return { empty: !v, value: v || "" };
  }
  // 「언젠가」·날짜 없음 → always last (ASC/DESC)
  if (isSomedayDeadline(row.task)) {
    return { empty: true, value: "" };
  }
  const r = taskDateRange(row.task);
  // 마감목표 정렬 = 시작일 기준
  const v = r?.start ?? "";
  return { empty: !v, value: v };
}

function importanceKey(row: SheetRow): { empty: boolean; value: number } {
  if (row.kind === "calendar") {
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
    const ka = deadlineKey(a);
    const kb = deadlineKey(b);
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
): SheetRow[] {
  if (!sort) return rows;
  return [...rows]
    .map((row, i) => ({ row, i }))
    .sort(
      (a, b) =>
        compareSheetRows(a.row, b.row, sort) || a.i - b.i,
    )
    .map((x) => x.row);
}

export function columnSortLabel(sort: ColumnSort | null): string {
  if (!sort) return "기본(추가순)";
  const name = sort.key === "deadline" ? "마감목표" : "중요도";
  return `${name} ${sort.dir === "asc" ? "오름차순▲" : "내림차순▼"}`;
}
