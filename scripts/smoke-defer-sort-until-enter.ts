/**
 * Father rule: defer live 등록일 sort while mid-input / incomplete.
 *   npx tsx scripts/smoke-defer-sort-until-enter.ts
 */
import {
  applyDefaultRegisteredSort,
  applySortPreservingDeferred,
  isTodoSortReady,
  orderTaskRowsByIds,
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

const old = task({
  id: "old",
  title: "오래된 일",
  createdAt: "2026-10-01T00:00:00.000Z",
});
const mid = task({
  id: "mid",
  title: "중간 일",
  createdAt: "2026-10-02T00:00:00.000Z",
});
const draft = task({
  id: "draft",
  title: "", // incomplete 할 일
  createdAt: "2026-11-08T12:00:00.000Z", // newest 등록일
  startDate: "2026-11-08",
  targetDate: "2026-11-08",
  importance: 2,
});

ok("incomplete-empty-title", !isTodoSortReady(draft));
ok(
  "incomplete-no-deadline",
  !isTodoSortReady(
    task({
      id: "x",
      title: "제목만",
      kind: "spot",
      startDate: null,
      targetDate: null,
    }),
  ),
);
ok(
  "complete-someday",
  isTodoSortReady(
    task({
      id: "y",
      title: "언젠가",
      kind: "someday",
      startDate: null,
      targetDate: null,
      importance: 1,
    }),
  ),
);
ok("complete-full", isTodoSortReady(old));

// New incomplete row sits at top of baseline (행 추가); must stay put while
// siblings would otherwise re-order by 등록일.
const baseline = [row(draft), row(old), row(mid)];
const fullySorted = applyDefaultRegisteredSort(baseline);
ok(
  "raw-registered-puts-draft-first",
  fullySorted.map((r) => r.id).join(",") === "draft,mid,old",
  fullySorted.map((r) => r.id),
);

const pinned = new Set(["draft"]);
const deferred = applySortPreservingDeferred(
  baseline,
  fullySorted,
  (r) => r.kind === "task" && (pinned.has(r.task.id) || !isTodoSortReady(r.task)),
);
ok(
  "incomplete-stays-at-baseline-index",
  deferred.map((r) => r.id).join(",") === "draft,mid,old",
  deferred.map((r) => r.id),
);

// Mid-edit of an older complete row: pin keeps it from jumping when 등록일 sort runs
const editBaseline = [row(old), row(mid), row(draft)];
const editSorted = applyDefaultRegisteredSort(editBaseline);
const midEditPinned = new Set(["old"]);
const midEdit = applySortPreservingDeferred(
  editBaseline,
  editSorted,
  (r) =>
    r.kind === "task" &&
    (midEditPinned.has(r.task.id) || !isTodoSortReady(r.task)),
);
ok(
  "mid-edit-old-row-stays-put",
  midEdit[0]?.id === "old",
  midEdit.map((r) => r.id),
);
ok(
  "incomplete-draft-also-preserved-slot",
  midEdit.map((r) => r.id).includes("draft"),
  midEdit.map((r) => r.id),
);

// After Enter commit: unpin complete row → ready rows re-sort; incomplete
// draft stays at its baseline index (here: last).
const afterEnter = applySortPreservingDeferred(
  editBaseline,
  editSorted,
  (r) => r.kind === "task" && !isTodoSortReady(r.task),
);
ok(
  "enter-commit-sorts-ready-rows",
  afterEnter.map((r) => r.id).join(",") === "mid,old,draft",
  afterEnter.map((r) => r.id),
);

const ordered = orderTaskRowsByIds(
  [row(mid), row(old), row(draft)],
  ["draft", "old", "mid"],
);
ok(
  "order-by-prev-ids",
  ordered.map((r) => r.id).join(",") === "draft,old,mid",
  ordered.map((r) => r.id),
);

// 「행 추가」new id must stay at built front, not append behind prev order
const withNew = orderTaskRowsByIds(
  [row(draft), row(old), row(mid)],
  ["mid", "old"],
);
ok(
  "new-row-keeps-built-front",
  withNew.map((r) => r.id).join(",") === "draft,mid,old",
  withNew.map((r) => r.id),
);

console.log("smoke-defer-sort-until-enter OK");
