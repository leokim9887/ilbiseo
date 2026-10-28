import type { SideListItem, Task } from "@/lib/types";
import type { SheetRow } from "@/lib/sheet-rows";

/** Collapse whitespace + lowercase for father-friendly substring match. */
export function normalizeSearchQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchesSearchText(haystack: string, query: string): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

export function taskMatchesSearch(task: Task, query: string): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  const blob = `${task.title}\n${task.memo}`;
  return matchesSearchText(blob, q);
}

export function sideItemMatchesSearch(
  item: SideListItem,
  query: string,
): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  return matchesSearchText(`${item.title}\n${item.memo}`, q);
}

export function filterTasksBySearch(tasks: Task[], query: string): Task[] {
  const q = normalizeSearchQuery(query);
  if (!q) return tasks;
  return tasks.filter((t) => taskMatchesSearch(t, q));
}

export function filterSideBySearch(
  items: SideListItem[],
  query: string,
): SideListItem[] {
  const q = normalizeSearchQuery(query);
  if (!q) return items;
  return items.filter((i) => sideItemMatchesSearch(i, q));
}

/**
 * Filter sheet rows by title/memo. Keeps past-separator only when both
 * current and past task groups still have matches.
 */
export function filterSheetRowsBySearch(
  rows: SheetRow[],
  query: string,
): SheetRow[] {
  const q = normalizeSearchQuery(query);
  if (!q) return rows;

  const kept: SheetRow[] = [];
  for (const row of rows) {
    if (row.kind === "past-separator") {
      kept.push(row);
      continue;
    }
    if (row.kind === "calendar") {
      const blob = `${row.event.title}\n${row.event.notes ?? ""}`;
      if (matchesSearchText(blob, q)) kept.push(row);
      continue;
    }
    if (taskMatchesSearch(row.task, q)) kept.push(row);
  }

  const sepIdx = kept.findIndex((r) => r.kind === "past-separator");
  if (sepIdx < 0) return kept;
  const before = kept.slice(0, sepIdx).filter((r) => r.kind !== "past-separator");
  const after = kept.slice(sepIdx + 1).filter((r) => r.kind !== "past-separator");
  if (before.length === 0 || after.length === 0) {
    return [...before, ...after];
  }
  return [
    ...before,
    { kind: "past-separator", id: "past-separator" },
    ...after,
  ];
}

export type SideSearchHit = {
  kind: "guideline" | "habit";
  item: SideListItem;
};
