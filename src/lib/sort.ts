import { isPastUnfinishedTask, todayIsoKst } from "./date-range";
import type { Task, TaskCategory, TaskKind } from "./types";

const KIND_ORDER: Record<TaskKind, number> = {
  spot: 0,
  ongoing: 1,
  someday: 2,
};

/** Newest `createdAt` first — used when migrating pre-v5 append-order arrays. */
export function orderByCreatedAtNewestFirst<
  T extends { createdAt: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Active tasks in **stored array order** (newest-first after v5).
 * Does not re-sort by title/importance — keeps 「행 추가」 position stable.
 */
export function listActiveInStoredOrder(
  tasks: Task[],
  category?: TaskCategory,
): Task[] {
  return tasks.filter(
    (t) =>
      t.status === "active" &&
      (category ? t.category === category : true),
  );
}

/** Active list for Excel/sync: stored order, then 「지난 일정」 sink to end. */
export function listActiveForExport(
  tasks: Task[],
  today: string = todayIsoKst(),
): Task[] {
  return sinkPastUnfinishedTasksLast(listActiveInStoredOrder(tasks), today);
}

function score(task: Task): number {
    // 중요도만 (시급성 열 제거 후)
  return task.importance;
}

/**
 * Keep overdue active tasks in the list, but push them to the end
 * (same 틀 — never auto-move to 한 일). Relative order within each
 * partition is preserved.
 */
export function sinkPastUnfinishedTasksLast(
  tasks: Task[],
  today: string = todayIsoKst(),
): Task[] {
  const current: Task[] = [];
  const past: Task[] = [];
  for (const t of tasks) {
    if (isPastUnfinishedTask(t, today)) past.push(t);
    else current.push(t);
  }
  if (past.length === 0) return current;
  return [...current, ...past];
}

export function sortTasks(tasks: Task[], category?: TaskCategory): Task[] {
  const active = tasks.filter(
    (t) =>
      t.status === "active" &&
      (category ? t.category === category : true),
  );
  const byGroup = new Map<string, Task[]>();

  for (const task of active) {
    const key = (task.groupKey || task.title).trim().toLowerCase() || "_";
    const list = byGroup.get(key) ?? [];
    list.push(task);
    byGroup.set(key, list);
  }

  const groupEntries = [...byGroup.entries()].map(([key, items]) => {
    const sortedItems = [...items].sort(compareWithinGroup);
    return { key, items: sortedItems, representative: sortedItems[0] };
  });

  groupEntries.sort((a, b) =>
    compareTasks(a.representative, b.representative),
  );

  return sinkPastUnfinishedTasksLast(groupEntries.flatMap((g) => g.items));
}

function compareWithinGroup(a: Task, b: Task): number {
  return compareTasks(a, b) || a.title.localeCompare(b.title, "ko");
}

function compareTasks(a: Task, b: Task): number {
  const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (kindDiff !== 0) return kindDiff;

  if (a.kind === "ongoing" || a.kind === "spot") {
    const da = a.targetDate ?? "9999-12-31";
    const db = b.targetDate ?? "9999-12-31";
    if (da !== db) return da.localeCompare(db);
  }

  const scoreDiff = score(b) - score(a);
  if (scoreDiff !== 0) return scoreDiff;

  return a.createdAt.localeCompare(b.createdAt);
}

export function sortCompleted(
  tasks: Task[],
  category?: TaskCategory,
): Task[] {
  return tasks
    .filter(
      (t) =>
        t.status === "completed" &&
        (category ? t.category === category : true),
    )
    .sort((a, b) =>
      (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
    );
}

export function inferGroupKey(title: string): string {
  const cleaned = title
    .replace(/\d+/g, "")
    .replace(/[()[\]【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length === 0) return title.trim().toLowerCase() || "기타";
  return tokens.slice(0, 2).join(" ");
}
