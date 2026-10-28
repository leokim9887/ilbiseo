/**
 * Unit smoke: schedule/task search filter helpers.
 */
import assert from "node:assert/strict";
import {
  filterSheetRowsBySearch,
  filterSideBySearch,
  filterTasksBySearch,
  matchesSearchText,
  normalizeSearchQuery,
  taskMatchesSearch,
} from "../src/lib/schedule-search";
import type { SideListItem, Task } from "../src/lib/types";
import type { SheetRow } from "../src/lib/sheet-rows";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: "2026-10-28",
    targetDate: "2026-10-28",
    urgency: 2,
    importance: 2,
    groupKey: "",
    memo: "",
    source: "manual",
    status: "active",
    createdAt: "2026-10-28T00:00:00.000Z",
    completedAt: null,
    ...partial,
  };
}

assert.equal(normalizeSearchQuery("  병원  예약 "), "병원 예약");
assert.equal(matchesSearchText("병원 예약하기", "병원"), true);
assert.equal(matchesSearchText("장보기", "병원"), false);

const tasks = [
  task({ id: "1", title: "병원 예약", memo: "진료" }),
  task({ id: "2", title: "장보기", memo: "우유" }),
  task({ id: "3", title: "보고서", memo: "병원 자료" }),
];
assert.equal(filterTasksBySearch(tasks, "병원").length, 2);
assert.equal(taskMatchesSearch(tasks[1], "우유"), true);

const sides: SideListItem[] = [
  {
    id: "g1",
    title: "아침 스트레칭",
    memo: "",
    done: false,
    createdAt: "",
    completedAt: null,
  },
  {
    id: "g2",
    title: "약 챙기기",
    memo: "병원 후",
    done: false,
    createdAt: "",
    completedAt: null,
  },
];
assert.equal(filterSideBySearch(sides, "병원").length, 1);
assert.equal(filterSideBySearch(sides, "스트레칭")[0]?.id, "g1");

const rows: SheetRow[] = [
  { kind: "task", id: "1", task: tasks[0], sortKey: "a" },
  { kind: "task", id: "2", task: tasks[1], sortKey: "b" },
  { kind: "past-separator", id: "past-separator" },
  { kind: "task", id: "3", task: tasks[2], sortKey: "c" },
];
const hit = filterSheetRowsBySearch(rows, "병원");
assert.equal(
  hit.filter((r) => r.kind === "task").length,
  2,
  "two hospital tasks",
);
assert.ok(
  hit.some((r) => r.kind === "past-separator"),
  "keeps separator when both sides match",
);

const onlyPast = filterSheetRowsBySearch(rows, "장보기");
assert.equal(onlyPast.filter((r) => r.kind === "task").length, 1);
assert.ok(
  !onlyPast.some((r) => r.kind === "past-separator"),
  "drops orphan separator",
);

const empty = filterSheetRowsBySearch(rows, "없는말");
assert.equal(empty.length, 0);

console.log(JSON.stringify({ ok: true, hospitalHits: 2 }));
