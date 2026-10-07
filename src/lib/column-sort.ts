import type { SheetRow } from "./sheet-rows";
import { taskDateRange } from "./date-range";

/** Sortable Excel columns (마감목표 · 중요도 · 시급성). */
export type ColumnSortKey = "deadline" | "importance" | "urgency";
export type ColumnSortDir = "asc" | "desc";

export type ColumnSort = {
  key: ColumnSortKey;
  dir: ColumnSortDir;
};

export const SORTABLE_COL_KEYS: ColumnSortKey[] = [
  "deadline",
  "importance",
  "urgency",
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
 * Empty / missing values always sort **last** (both asc and desc),
 * so blank 마감·중요·시급 rows sink to the bottom consistently.
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
  const r = taskDateRange(row.task);
  // 마감목표 = 종료(마감)일 기준
  const v = r?.end ?? "";
  return { empty: !v, value: v };
}

function numberKey(
  row: SheetRow,
  field: "importance" | "urgency",
): { empty: boolean; value: number } {
  if (row.kind === "calendar") {
    return { empty: true, value: 0 };
  }
  const v = row.task[field];
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
  const ka = numberKey(a, sort.key);
  const kb = numberKey(b, sort.key);
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
  if (!sort) return "기본(스팟·지속·언젠가)";
  const name =
    sort.key === "deadline"
      ? "마감목표"
      : sort.key === "importance"
        ? "중요도"
        : "시급성";
  return `${name} ${sort.dir === "asc" ? "오름차순▲" : "내림차순▼"}`;
}
