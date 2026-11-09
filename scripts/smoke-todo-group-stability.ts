/**
 * 「구분하기」후 클릭/포커스 pin 해도 그룹·미그룹 행 순서가 뒤집히지 않아야 함.
 * (그룹 클러스터를 defer-pin 보존보다 먼저 적용)
 */
import {
  applyDefaultRegisteredSort,
  applySortPreservingDeferred,
  isTodoSortReady,
  orderTaskRowsByIds,
} from "../src/lib/column-sort";
import { sinkPastSheetRowsLast, type SheetRow } from "../src/lib/sheet-rows";
import { insertGroupSeparators } from "../src/lib/todo-group";
import type { Task } from "../src/lib/types";

function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exit(1);
  }
  console.log("ok", name, detail ?? "");
}

function task(p: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: "2026-11-10",
    targetDate: "2026-11-20",
    urgency: 1,
    importance: 2,
    groupKey: "",
    groupId: null,
    groupLabel: null,
    memo: "",
    source: "manual",
    status: "active",
    createdAt: "2026-11-01T00:00:00.000Z",
    completedAt: null,
    ...p,
  };
}

function row(t: Task): SheetRow {
  return { kind: "task", id: t.id, task: t, sortKey: t.id };
}

function summarize(rows: SheetRow[]) {
  return rows
    .map((r) =>
      r.kind === "task"
        ? r.id
        : r.kind === "group-separator"
          ? `SEP:${r.label}`
          : r.kind,
    )
    .join(",");
}

const TODAY = "2026-11-09";
const tasks: Task[] = [
  task({
    id: "a",
    title: "병원 A",
    groupId: "grp:병원",
    groupLabel: "병원",
    createdAt: "2026-11-08T00:00:00.000Z",
  }),
  task({ id: "u1", title: "일반1", createdAt: "2026-11-07T00:00:00.000Z" }),
  task({
    id: "b",
    title: "병원 B",
    groupId: "grp:병원",
    groupLabel: "병원",
    createdAt: "2026-11-06T00:00:00.000Z",
  }),
  task({
    id: "c",
    title: "세금 C",
    groupId: "grp:세금",
    groupLabel: "세금",
    createdAt: "2026-11-05T00:00:00.000Z",
  }),
  task({ id: "u2", title: "일반2", createdAt: "2026-11-04T00:00:00.000Z" }),
  task({
    id: "d",
    title: "세금 D",
    groupId: "grp:세금",
    groupLabel: "세금",
    createdAt: "2026-11-03T00:00:00.000Z",
  }),
];

/** Same order as excel-workbook: group separators before defer preserve. */
function pipeline(
  all: Task[],
  displayOrder: string[],
  pinned: Set<string>,
): SheetRow[] {
  const built = all.map(row);
  const sorted = applyDefaultRegisteredSort(built);
  const fullySorted = insertGroupSeparators(
    sinkPastSheetRowsLast(sorted, TODAY),
  );
  const baselineTasks = orderTaskRowsByIds(built, displayOrder);
  const baseline = insertGroupSeparators(
    sinkPastSheetRowsLast(baselineTasks, TODAY),
  );
  const isDeferred = (r: SheetRow) => {
    if (r.kind !== "task") return false;
    if (pinned.has(r.task.id)) return true;
    if (!isTodoSortReady(r.task)) return true;
    return false;
  };
  return applySortPreservingDeferred(baseline, fullySorted, isDeferred);
}

const expected = "u1,u2,SEP:병원,a,b,SEP:세금,c,d";
let displayOrder: string[] = [];
let pinned = new Set<string>();
let prev: string | null = null;
const hops = [null, "a", "b", "c", "u1", "d", "a", "b", "u2", "a"] as const;
for (const id of hops) {
  if (prev) pinned.delete(prev);
  if (id) pinned.add(id);
  const result = pipeline(tasks, displayOrder, pinned);
  const s = summarize(result);
  ok(`focus-${id ?? "none"}`, s === expected, s);
  displayOrder = result.filter((r) => r.kind === "task").map((r) => r.id);
  prev = id;
}

// Incomplete draft stays put (IB-33) while grouped siblings stay stable
const draft = task({
  id: "draft",
  title: "",
  createdAt: "2026-11-09T12:00:00.000Z",
  startDate: "2026-11-09",
  targetDate: "2026-11-09",
});
const withDraft = [draft, ...tasks];
displayOrder = [];
pinned = new Set();
prev = null;
const expectedDraft = "draft,u1,u2,SEP:병원,a,b,SEP:세금,c,d";
for (const id of ["a", "draft", "b", "u1"] as const) {
  if (prev) pinned.delete(prev);
  pinned.add(id);
  const result = pipeline(withDraft, displayOrder, pinned);
  const s = summarize(result);
  ok(`draft-focus-${id}`, s === expectedDraft, s);
  displayOrder = result.filter((r) => r.kind === "task").map((r) => r.id);
  prev = id;
}

console.log("ok smoke-todo-group-stability");
