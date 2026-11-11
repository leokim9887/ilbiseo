/**
 * IB-39 — 모바일 구분선 중복·고아·묶기 해제 회귀.
 * 동일 groupId/label은 틀당 1개; defer merge가 separator id를 복제하지 않음.
 */
import assert from "node:assert/strict";
import {
  applyDefaultRegisteredSort,
  applySortPreservingDeferred,
  dedupeSheetRowsById,
  isTodoSortReady,
  orderTaskRowsByIds,
} from "../src/lib/column-sort";
import { addDaysIso, todayIsoKst } from "../src/lib/date-range";
import { sinkPastSheetRowsLast, type SheetRow } from "../src/lib/sheet-rows";
import {
  canonicalGroupIdForTask,
  canonicalizeTaskGroup,
  insertGroupSeparators,
  sanitizeGroupSeparators,
} from "../src/lib/todo-group";
import type { Task } from "../src/lib/types";

const TODAY = todayIsoKst();

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
    startDate: TODAY,
    targetDate: TODAY,
    urgency: 1,
    importance: 2,
    groupKey: "",
    groupId: null,
    groupLabel: null,
    memo: "",
    source: "manual",
    status: "active",
    createdAt: `${TODAY}T00:00:00.000Z`,
    completedAt: null,
    ...p,
  };
}

function row(t: Task): SheetRow {
  return { kind: "task", id: t.id, task: t, sortKey: t.id };
}

function sepCount(rows: SheetRow[], label?: string) {
  return rows.filter(
    (r) =>
      r.kind === "group-separator" &&
      (label == null || r.label === label),
  ).length;
}

function sepIds(rows: SheetRow[]) {
  return rows
    .filter((r) => r.kind === "group-separator")
    .map((r) => r.id);
}

// --- same label, mismatched groupIds → one divider ---
{
  const rows: SheetRow[] = [
    row(
      task({
        id: "a",
        title: "영업 A",
        groupId: "grp:stale-uuid-1",
        groupLabel: "영업, 고객사",
      }),
    ),
    row(task({ id: "u", title: "일반" })),
    row(
      task({
        id: "b",
        title: "영업 B",
        groupId: "grp:영업, 고객사",
        groupLabel: "영업, 고객사",
      }),
    ),
    row(
      task({
        id: "c",
        title: "영업 C",
        groupId: "grp:stale-uuid-2",
        groupLabel: "영업, 고객사",
      }),
    ),
  ];
  const out = insertGroupSeparators(rows);
  ok("mismatched ids → 1 sep", sepCount(out, "영업, 고객사") === 1, {
    seps: sepIds(out),
    kinds: out.map((r) =>
      r.kind === "group-separator" ? `SEP:${r.label}` : r.id,
    ),
  });
  ok(
    "canonical id from label",
    out.some(
      (r) =>
        r.kind === "group-separator" &&
        r.groupId === "grp:영업, 고객사",
    ),
  );
}

// --- past + current same group → still 1 sep per 틀 ---
{
  const rows: SheetRow[] = [
    row(
      task({
        id: "now",
        title: "영업 현재",
        groupId: "grp:영업, 고객사",
        groupLabel: "영업, 고객사",
        targetDate: addDaysIso(TODAY, 5),
        startDate: TODAY,
      }),
    ),
    row(
      task({
        id: "old",
        title: "영업 과거",
        groupId: "grp:영업, 고객사",
        groupLabel: "영업, 고객사",
        targetDate: addDaysIso(TODAY, -5),
        startDate: addDaysIso(TODAY, -10),
      }),
    ),
    row(task({ id: "u", title: "일반", targetDate: addDaysIso(TODAY, 3) })),
  ];
  const out = insertGroupSeparators(sinkPastSheetRowsLast(rows, TODAY));
  ok("past+current → 1 sep per 틀", sepCount(out, "영업, 고객사") === 1, {
    seps: sepIds(out),
    hasPast: out.some((r) => r.kind === "past-separator"),
  });
  ok(
    "unique sep ids",
    new Set(sepIds(out)).size === sepIds(out).length,
    sepIds(out),
  );
}

// --- orphan + consecutive duplicate seps cleaned ---
{
  const dirty: SheetRow[] = [
    {
      kind: "group-separator",
      id: "group-sep:all:grp:영업, 고객사",
      groupId: "grp:영업, 고객사",
      label: "영업, 고객사",
    },
    {
      kind: "group-separator",
      id: "group-sep:dup1",
      groupId: "grp:영업, 고객사",
      label: "영업, 고객사",
    },
    {
      kind: "group-separator",
      id: "group-sep:dup2",
      groupId: "grp:stale",
      label: "영업, 고객사",
    },
    {
      kind: "group-separator",
      id: "group-sep:orphan",
      groupId: "grp:없는그룹",
      label: "없는그룹",
    },
    row(
      task({
        id: "a",
        title: "영업 A",
        groupId: "grp:영업, 고객사",
        groupLabel: "영업, 고객사",
      }),
    ),
  ];
  const clean = sanitizeGroupSeparators(dirty);
  ok("sanitize keeps 1 live sep", sepCount(clean, "영업, 고객사") === 1);
  ok("sanitize drops orphan", sepCount(clean, "없는그룹") === 0);
  ok("member survives", clean.some((r) => r.kind === "task" && r.id === "a"));
}

// --- applySortPreservingDeferred never duplicates separator ids ---
{
  const mkSep = (): SheetRow => ({
    kind: "group-separator",
    id: "group-sep:g",
    groupId: "grp:g",
    label: "L",
  });
  const baseline: SheetRow[] = [
    row(task({ id: "p1", title: "p1" })),
    row(task({ id: "p2", title: "p2" })),
    mkSep(),
    mkSep(),
    mkSep(),
    mkSep(),
  ];
  const fully: SheetRow[] = [
    mkSep(),
    mkSep(),
    mkSep(),
    mkSep(),
    row(task({ id: "p1", title: "p1" })),
    row(task({ id: "p2", title: "p2" })),
  ];
  const pinned = new Set(["p1", "p2"]);
  const result = applySortPreservingDeferred(
    baseline,
    fully,
    (r) => r.kind === "task" && pinned.has(r.id),
  );
  const ids = result.map((r) => r.id);
  ok(
    "defer merge: no duplicate ids",
    ids.length === new Set(ids).size,
    ids,
  );
  ok(
    "defer merge: at most one group-sep:g",
    ids.filter((id) => id === "group-sep:g").length <= 1,
    ids,
  );
}

// --- workbook-style pipeline with pins stays at 1 sep ---
{
  const tasks: Task[] = [
    task({
      id: "a",
      title: "영업 A",
      groupId: "grp:stale-a",
      groupLabel: "영업, 고객사",
      createdAt: `${TODAY}T08:00:00.000Z`,
    }),
    task({
      id: "b",
      title: "영업 B",
      groupId: "grp:영업, 고객사",
      groupLabel: "영업, 고객사",
      createdAt: `${TODAY}T07:00:00.000Z`,
    }),
    task({
      id: "u",
      title: "일반",
      createdAt: `${TODAY}T06:00:00.000Z`,
    }),
  ];
  function pipeline(displayOrder: string[], pinned: Set<string>): SheetRow[] {
    const built = tasks.map(row);
    const sorted = applyDefaultRegisteredSort(built);
    const fullySorted = insertGroupSeparators(
      sinkPastSheetRowsLast(sorted, TODAY),
    );
    const baselineTasks = orderTaskRowsByIds(built, displayOrder);
    const baseline = insertGroupSeparators(
      sinkPastSheetRowsLast(baselineTasks, TODAY),
    );
    const merged = applySortPreservingDeferred(
      baseline,
      fullySorted,
      (r) => {
        if (r.kind !== "task") return false;
        if (pinned.has(r.task.id)) return true;
        if (!isTodoSortReady(r.task)) return true;
        return false;
      },
    );
    return sanitizeGroupSeparators(merged);
  }
  let displayOrder: string[] = [];
  let prev: string | null = null;
  for (const id of [null, "a", "b", "u", "a", "b"] as const) {
    const pinned = new Set<string>();
    if (id) pinned.add(id);
    if (prev && prev !== id) {
      /* single pin like workbook focus hops */
    }
    const result = pipeline(displayOrder, pinned);
    ok(
      `pipeline-focus-${id ?? "none"}: 1 sep`,
      sepCount(result, "영업, 고객사") === 1,
      result.map((r) =>
        r.kind === "group-separator" ? `SEP:${r.label}` : r.id,
      ),
    );
    displayOrder = result.filter((r) => r.kind === "task").map((r) => r.id);
    prev = id;
  }
}

// --- canonicalize helpers ---
{
  const c = canonicalizeTaskGroup({
    groupId: "grp:stale",
    groupLabel: "영업, 고객사",
  });
  ok("canonicalize id from label", c.groupId === "grp:영업, 고객사");
  ok(
    "canonicalGroupIdForTask",
    canonicalGroupIdForTask({
      groupId: "grp:stale",
      groupLabel: "영업, 고객사",
    }) === "grp:영업, 고객사",
  );
  const ungrouped = canonicalizeTaskGroup({
    groupId: null,
    groupLabel: null,
  });
  ok("canonicalize keeps null ungroup", ungrouped.groupId === null);
}

ok(
  "dedupeSheetRowsById",
  dedupeSheetRowsById([
    row(task({ id: "a", title: "a" })),
    row(task({ id: "a", title: "a2" })),
    row(task({ id: "b", title: "b" })),
  ]).map((r) => r.id).join(",") === "a,b",
);

console.log("ok smoke-todo-group-dedupe");
