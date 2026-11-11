import { createId } from "./id";
import { normalizeSearchQuery } from "./schedule-search";
import type { SheetRow } from "./sheet-rows";
import {
  taskWordingBlob,
  tokenizeMeaningful,
} from "./text-similarity";
import type { Task } from "./types";

/**
 * 「구분하기」버튼 표시·적용 최소 선택 수.
 * 검색만으로는 버튼이 뜨지 않음 — 체크 선택이 이 수 이상이어야 함.
 */
export const MIN_TODO_GROUP_SELECTION = 2;

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
 * Canonical group id for a task: prefer label→id so the same keyword
 * never splits into multiple divider rows (stale/mismatched groupId).
 */
export function canonicalGroupIdForTask(
  task: Pick<Task, "groupId" | "groupLabel">,
): string {
  const label = normalizeGroupLabel(task.groupLabel);
  if (label) {
    const fromLabel = groupIdFromLabel(label);
    if (fromLabel) return fromLabel;
  }
  return task.groupId?.trim() || "";
}

/** Persist-time repair: label wins; id derived from label when present. */
export function canonicalizeTaskGroup<
  T extends Pick<Task, "groupId" | "groupLabel">,
>(task: T): T {
  const label = normalizeGroupLabel(task.groupLabel);
  if (label) {
    const gid = groupIdFromLabel(label) || task.groupId?.trim() || null;
    return { ...task, groupId: gid, groupLabel: label };
  }
  const gid = task.groupId?.trim() || null;
  return { ...task, groupId: gid, groupLabel: null };
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
 *
 * Same display label → same canonical groupId (prevents duplicate dividers).
 */
function clusterPartition(
  rows: SheetRow[],
  scope: "current" | "past" | "all" = "all",
): SheetRow[] {
  const cleaned = rows.filter((r) => r.kind !== "group-separator");
  const ungrouped: SheetRow[] = [];
  const groupOrder: string[] = [];
  const clusters = new Map<string, Extract<SheetRow, { kind: "task" }>[]>();
  const labelByGid = new Map<string, string>();

  for (const row of cleaned) {
    if (row.kind !== "task") {
      ungrouped.push(row);
      continue;
    }
    const gid = canonicalGroupIdForTask(row.task);
    if (!gid) {
      ungrouped.push(row);
      continue;
    }
    if (!clusters.has(gid)) {
      clusters.set(gid, []);
      groupOrder.push(gid);
      const label =
        normalizeGroupLabel(row.task.groupLabel) ||
        extractGroupKeyword([row.task]);
      labelByGid.set(gid, label);
    }
    clusters.get(gid)!.push(row);
  }

  const out: SheetRow[] = [...ungrouped];
  for (const gid of groupOrder) {
    const cluster = clusters.get(gid) ?? [];
    if (cluster.length === 0) continue;
    const label =
      labelByGid.get(gid) ||
      normalizeGroupLabel(cluster[0].task.groupLabel) ||
      extractGroupKeyword(cluster.map((r) => r.task));
    // Scope suffix keeps React keys unique if a group ever appears twice;
    // insertGroupSeparators still emits at most one sep per 틀.
    out.push({
      kind: "group-separator",
      id: `group-sep:${scope}:${gid}`,
      groupId: gid,
      label,
    });
    out.push(...cluster);
  }
  return out;
}

/**
 * Drop orphan dividers and collapse duplicate groupId/label separators
 * so each 틀 shows at most one divider per group.
 */
export function sanitizeGroupSeparators(rows: SheetRow[]): SheetRow[] {
  if (rows.length === 0) return rows;

  const presentIds = new Set<string>();
  const presentLabels = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "task") continue;
    const gid = canonicalGroupIdForTask(row.task);
    if (!gid) continue;
    presentIds.add(gid);
    const lab = normalizeGroupLabel(row.task.groupLabel);
    if (lab) presentLabels.add(lab);
  }

  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const out: SheetRow[] = [];
  for (const row of rows) {
    if (row.kind !== "group-separator") {
      out.push(row);
      continue;
    }
    const lab = normalizeGroupLabel(row.label) || row.label;
    const alive =
      presentIds.has(row.groupId) ||
      (lab ? presentLabels.has(lab) : false);
    if (!alive) continue;
    if (seenIds.has(row.groupId)) continue;
    if (lab && seenLabels.has(lab)) continue;
    seenIds.add(row.groupId);
    if (lab) seenLabels.add(lab);
    out.push(row);
  }
  return out;
}

/**
 * After sort + 「지난 일정」sink: cluster user groups and insert
 * divider rows (same visual role as past-separator).
 * Same groupId/label → at most one divider per 틀 (not per past/current).
 */
export function insertGroupSeparators(rows: SheetRow[]): SheetRow[] {
  if (rows.length === 0) return rows;
  const sepIdx = rows.findIndex((r) => r.kind === "past-separator");
  if (sepIdx < 0) {
    return sanitizeGroupSeparators(clusterPartition(rows, "all"));
  }
  const before = clusterPartition(rows.slice(0, sepIdx), "current");
  const after = clusterPartition(rows.slice(sepIdx + 1), "past");

  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  for (const r of before) {
    if (r.kind !== "group-separator") continue;
    seenIds.add(r.groupId);
    const lab = normalizeGroupLabel(r.label) || r.label;
    if (lab) seenLabels.add(lab);
  }
  // 틀당 1개: past 쪽에서는 이미 current에 있는 그룹 구분선을 넣지 않음.
  const afterDeduped = after.filter((r) => {
    if (r.kind !== "group-separator") return true;
    const lab = normalizeGroupLabel(r.label) || r.label;
    if (seenIds.has(r.groupId)) return false;
    if (lab && seenLabels.has(lab)) return false;
    seenIds.add(r.groupId);
    if (lab) seenLabels.add(lab);
    return true;
  });

  return sanitizeGroupSeparators([
    ...before,
    { kind: "past-separator", id: "past-separator" },
    ...afterDeduped,
  ]);
}

/** Drop group separators that no longer have task members (e.g. after search). */
export function pruneEmptyGroupSeparators(rows: SheetRow[]): SheetRow[] {
  return sanitizeGroupSeparators(rows);
}
