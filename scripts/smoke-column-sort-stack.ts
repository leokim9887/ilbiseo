/**
 * Multi-level column sort + deadline start/end basis.
 *   npx tsx scripts/smoke-column-sort-stack.ts
 */
import {
  applyColumnSortStack,
  cycleColumnSortStack,
  columnSortStackLabel,
  type ColumnSortStack,
} from "../src/lib/column-sort";
import type { SheetRow } from "../src/lib/sheet-rows";
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
    groupKey: "g",
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

// cycle: first click deadline → primary start asc
let stack: ColumnSortStack | null = null;
stack = cycleColumnSortStack(stack, "deadline");
ok(
  "first-deadline-start-asc",
  stack?.primary.key === "deadline" &&
    stack.primary.dir === "asc" &&
    stack.primary.basis === "start" &&
    stack.secondary === null,
  stack,
);

// second click importance → secondary
stack = cycleColumnSortStack(stack, "importance");
ok(
  "second-importance-secondary",
  stack?.primary.key === "deadline" &&
    stack.secondary?.key === "importance" &&
    stack.secondary.dir === "asc",
  stack,
);

const label = columnSortStackLabel(stack);
ok("label-has-both", label.includes("마감목표") && label.includes("중요도"), label);

// apply: primary end date, then importance
const a = task({
  id: "a",
  title: "A",
  startDate: "2026-11-01",
  targetDate: "2026-11-30",
  importance: 1,
});
const b = task({
  id: "b",
  title: "B",
  startDate: "2026-11-05",
  targetDate: "2026-11-15",
  importance: 3,
});
const c = task({
  id: "c",
  title: "C",
  startDate: "2026-11-03",
  targetDate: "2026-11-15",
  importance: 2,
});
const rows = [row(a), row(b), row(c)];

const byEnd: ColumnSortStack = {
  primary: { key: "deadline", dir: "asc", basis: "end" },
  secondary: { key: "importance", dir: "desc" },
};
const sortedEnd = applyColumnSortStack(rows, byEnd);
ok(
  "end-then-importance",
  sortedEnd.map((r) => (r.kind === "task" ? r.task.id : "")).join(",") ===
    "b,c,a",
  sortedEnd.map((r) => (r.kind === "task" ? r.task.id : "")),
);

const byStart: ColumnSortStack = {
  primary: { key: "deadline", dir: "asc", basis: "start" },
  secondary: null,
};
const sortedStart = applyColumnSortStack(rows, byStart);
ok(
  "start-asc",
  sortedStart.map((r) => (r.kind === "task" ? r.task.id : "")).join(",") ===
    "a,c,b",
  sortedStart.map((r) => (r.kind === "task" ? r.task.id : "")),
);

// cycle deadline through start→end
stack = { primary: { key: "deadline", dir: "asc", basis: "start" }, secondary: null };
stack = cycleColumnSortStack(stack, "deadline"); // start desc
ok("cycle-start-desc", stack?.primary.basis === "start" && stack.primary.dir === "desc", stack);
stack = cycleColumnSortStack(stack, "deadline"); // end asc
ok("cycle-end-asc", stack?.primary.basis === "end" && stack.primary.dir === "asc", stack);
stack = cycleColumnSortStack(stack, "deadline"); // end desc
ok("cycle-end-desc", stack?.primary.basis === "end" && stack.primary.dir === "desc", stack);
stack = cycleColumnSortStack(stack, "deadline"); // clear
ok("cycle-clear", stack === null, stack);

console.log("smoke-column-sort-stack OK");
