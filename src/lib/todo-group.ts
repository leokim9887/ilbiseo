import { createId } from "./id";
import { normalizeSearchQuery } from "./schedule-search";
import type { SheetRow } from "./sheet-rows";
import {
  taskWordingBlob,
  tokenizeMeaningful,
} from "./text-similarity";
import type { Task } from "./types";

/**
 * Display keyword for 「구분하기」— always uppercase (father-facing).
 * Empty → null. Id derivation still lowercases separately.
 */
export function normalizeGroupLabel(
  label: string | null | undefined,
): string | null {
  if (label == null) return null;
  const n = label
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("en-US");
  return n || null;
}

/** Stable group id from a display keyword (excel round-trip friendly). */
export function groupIdFromLabel(label: string): string {
  const n = label
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!n) return "";
  return `grp:${n}`;
}

/**
 * Pick one keyword for a 「구분하기」 divider.
 * Search mode → search query wins; else common / frequent tokens
 * from title+memo (reuses `tokenizeMeaningful`). Always uppercase.
 */
export function extractGroupKeyword(
  tasks: Pick<Task, "title" | "memo">[],
  searchQuery?: string,
): string {
  const q = normalizeSearchQuery(searchQuery ?? "");
  let raw = "";
  if (q) {
    const tokens = tokenizeMeaningful(q);
    if (tokens[0]) raw = tokens[0];
    else raw = q.length > 24 ? q.slice(0, 24) : q;
  } else if (tasks.length === 0) {
    raw = "구분";
  } else {
    const perTask = tasks.map(
      (t) => new Set(tokenizeMeaningful(taskWordingBlob(t))),
    );

    if (perTask.length >= 2) {
      let common = [...perTask[0]];
      for (let i = 1; i < perTask.length; i++) {
        const set = perTask[i];
        common = common.filter((tok) => set.has(tok));
      }
      if (common.length > 0) {
        common.sort(
          (a, b) => b.length - a.length || a.localeCompare(b, "ko"),
        );
        raw = common[0];
      }
    }

    if (!raw) {
      const counts = new Map<string, number>();
      for (const set of perTask) {
        for (const tok of set) {
          counts.set(tok, (counts.get(tok) ?? 0) + 1);
        }
      }
      const ranked = [...counts.entries()].sort(
        (a, b) =>
          b[1] - a[1] ||
          b[0].length - a[0].length ||
          a[0].localeCompare(b[0], "ko"),
      );
      if (ranked[0]) raw = ranked[0][0];
    }

    if (!raw) {
      for (const t of tasks) {
        const tok = tokenizeMeaningful(t.title);
        if (tok[0]) {
          raw = tok[0];
          break;
        }
      }
    }
    if (!raw) raw = "구분";
  }
  return normalizeGroupLabel(raw) ?? "구분";
}

/** Build groupId + label for a new 「구분하기」 action. */
export function makeTodoGroup(
  tasks: Pick<Task, "title" | "memo">[],
  searchQuery?: string,
): { groupId: string; groupLabel: string } {
  const groupLabel = extractGroupKeyword(tasks, searchQuery);
  const fromLabel = groupIdFromLabel(groupLabel);
  return {
    groupLabel,
    groupId: fromLabel || `grp:${createId()}`,
  };
}

/**
 * Excel/export order: keep relative order, but pull same-group rows
 * into contiguous blocks (ungrouped first, then groups in first-seen order).
 * Mirrors UI `clusterPartition` without separator rows.
 */
export function clusterTasksByGroup<T extends Pick<Task, "groupId">>(
  tasks: T[],
): T[] {
  if (tasks.length <= 1) return tasks;
  const ungrouped: T[] = [];
  const groupOrder: string[] = [];
  const clusters = new Map<string, T[]>();
  for (const t of tasks) {
    const gid = t.groupId?.trim() || "";
    if (!gid) {
      ungrouped.push(t);
      continue;
    }
    if (!clusters.has(gid)) {
      clusters.set(gid, []);
      groupOrder.push(gid);
    }
    clusters.get(gid)!.push(t);
  }
  const out: T[] = [...ungrouped];
  for (const gid of groupOrder) {
    out.push(...(clusters.get(gid) ?? []));
  }
  return out;
}

/**
 * Within one partition (current or past):
 * 1) ungrouped (+ non-task) rows keep relative order on top
 * 2) then each user group: divider + members (first-seen order)
 * So nothing ungrouped sits visually “under” a group divider.
 */
function clusterPartition(rows: SheetRow[]): SheetRow[] {
  const cleaned = rows.filter((r) => r.kind !== "group-separator");
  const ungrouped: SheetRow[] = [];
  const groupOrder: string[] = [];
  const clusters = new Map<string, Extract<SheetRow, { kind: "task" }>[]>();

  for (const row of cleaned) {
    if (row.kind !== "task") {
      ungrouped.push(row);
      continue;
    }
    const gid = row.task.groupId?.trim() || "";
    if (!gid) {
      ungrouped.push(row);
      continue;
    }
    if (!clusters.has(gid)) {
      clusters.set(gid, []);
      groupOrder.push(gid);
    }
    clusters.get(gid)!.push(row);
  }

  const out: SheetRow[] = [...ungrouped];
  for (const gid of groupOrder) {
    const cluster = clusters.get(gid) ?? [];
    if (cluster.length === 0) continue;
    const label =
      normalizeGroupLabel(cluster[0].task.groupLabel) ||
      extractGroupKeyword(cluster.map((r) => r.task));
    out.push({
      kind: "group-separator",
      id: `group-sep:${gid}`,
      groupId: gid,
      label,
    });
    out.push(...cluster);
  }
  return out;
}

/**
 * After sort + 「지난 일정」sink: cluster user groups and insert
 * divider rows (same visual role as past-separator).
 */
export function insertGroupSeparators(rows: SheetRow[]): SheetRow[] {
  if (rows.length === 0) return rows;
  const sepIdx = rows.findIndex((r) => r.kind === "past-separator");
  if (sepIdx < 0) return clusterPartition(rows);
  const before = clusterPartition(rows.slice(0, sepIdx));
  const after = clusterPartition(rows.slice(sepIdx + 1));
  return [
    ...before,
    { kind: "past-separator", id: "past-separator" },
    ...after,
  ];
}

/** Drop group separators that no longer have task members (e.g. after search). */
export function pruneEmptyGroupSeparators(rows: SheetRow[]): SheetRow[] {
  const present = new Set<string>();
  for (const row of rows) {
    if (row.kind === "task" && row.task.groupId) {
      present.add(row.task.groupId);
    }
  }
  return rows.filter(
    (r) => r.kind !== "group-separator" || present.has(r.groupId),
  );
}
