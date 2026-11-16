/**
 * IB-40 — 기존 「구분하기」그룹에 행을 추가해도 키워드(라벨)는 고정.
 * 재추출·자동 재명명 금지. 수동 구분선 이름 수정만 라벨 변경.
 */
import assert from "node:assert/strict";
import { addDaysIso, todayIsoKst } from "../src/lib/date-range";
import type { SheetRow } from "../src/lib/sheet-rows";
import {
  groupIdFromLabel,
  insertGroupSeparators,
  labelHintFromGroupId,
  makeTodoGroup,
  normalizeGroupLabel,
  pickPinnedExistingGroup,
} from "../src/lib/todo-group";
import type { Task } from "../src/lib/types";

const TODAY = todayIsoKst();

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: addDaysIso(TODAY, 3),
    targetDate: addDaysIso(TODAY, 3),
    urgency: 2,
    importance: 2,
    groupKey: "",
    groupId: null,
    groupLabel: null,
    memo: "",
    source: "manual",
    status: "active",
    createdAt: `${TODAY}T00:00:00.000Z`,
    completedAt: null,
    ...partial,
  };
}

assert.equal(labelHintFromGroupId("grp:병원"), "병원");
assert.equal(labelHintFromGroupId("grp:hospital"), "HOSPITAL");
assert.equal(labelHintFromGroupId("grp:"), null);
assert.equal(labelHintFromGroupId(null), null);

const hospitalA = task({
  id: "a",
  title: "병원 예약",
  groupId: "grp:병원",
  groupLabel: "병원",
});
const hospitalB = task({
  id: "b",
  title: "병원 약",
  groupId: "grp:병원",
  groupLabel: "병원",
});
// 공통 키워드 없음 — 추가해도 라벨은 「병원」유지
const unrelated = task({ id: "c", title: "장보기 목록" });

const pinned = pickPinnedExistingGroup([hospitalA, hospitalB, unrelated]);
assert.ok(pinned, "existing group must pin");
assert.equal(pinned!.groupLabel, "병원");
assert.equal(pinned!.groupId, "grp:병원");

const added = makeTodoGroup([hospitalA, hospitalB, unrelated]);
assert.equal(added.groupLabel, "병원", "add-to-group must not re-extract");
assert.equal(added.groupId, "grp:병원");

// 검색어가 있어도 기존 그룹이면 검색으로 덮어쓰지 않음
const withSearch = makeTodoGroup(
  [hospitalA, unrelated],
  "세금 신고",
);
assert.equal(
  withSearch.groupLabel,
  "병원",
  "search must not rename an existing pinned group",
);

// 신규 그룹만 추출 (교집합 없어도 빈도/첫 토큰)
const fresh = makeTodoGroup([
  task({ id: "n1", title: "팀 회의 준비" }),
  task({ id: "n2", title: "팀 회의 자료" }),
]);
assert.equal(fresh.groupLabel, "회의");
assert.equal(fresh.groupId, "grp:회의");

// 교집합이 없어도 기존 라벨 pin (회귀 가드)
const afterAdd = makeTodoGroup([
  hospitalA,
  hospitalB,
  unrelated,
  task({ id: "d", title: "운동하기", memo: "헬스장" }),
]);
assert.equal(afterAdd.groupLabel, "병원");
assert.equal(afterAdd.groupId, groupIdFromLabel("병원"));

// 여러 기존 그룹이 섞이면 멤버 수가 많은 쪽 라벨 유지
const tax1 = task({
  id: "t1",
  title: "세금 A",
  groupId: "grp:세금",
  groupLabel: "세금",
});
const mixed = makeTodoGroup([hospitalA, hospitalB, tax1, unrelated]);
assert.equal(mixed.groupLabel, "병원", "majority existing group wins");
assert.equal(mixed.groupId, "grp:병원");

// 구분선 표시: 멤버 제목이 바뀌어도 저장된 라벨 유지
const rows: SheetRow[] = [
  {
    kind: "task",
    id: "a",
    task: { ...hospitalA, title: "완전히 다른 제목" },
    sortKey: "a",
  },
  {
    kind: "task",
    id: "c",
    task: {
      ...unrelated,
      groupId: "grp:병원",
      groupLabel: "병원",
    },
    sortKey: "b",
  },
];
const clustered = insertGroupSeparators(rows);
const sep = clustered.find((r) => r.kind === "group-separator");
assert.ok(sep && sep.kind === "group-separator");
assert.equal(
  sep && sep.kind === "group-separator" ? sep.label : null,
  "병원",
  "divider display must keep stored label",
);

// 수동 이름 변경만 라벨을 바꿈 (rename 경로 시뮬레이션)
const renamedLabel = normalizeGroupLabel("가족 모임");
assert.equal(renamedLabel, "가족 모임");
const renamedId = groupIdFromLabel(renamedLabel!);
const afterRename = makeTodoGroup([
  {
    ...hospitalA,
    groupId: renamedId,
    groupLabel: renamedLabel,
  },
  {
    ...unrelated,
    // still ungrouped — joining into manually renamed group
  },
]);
assert.equal(afterRename.groupLabel, "가족 모임");
assert.equal(afterRename.groupId, renamedId);

console.log("smoke-todo-group-pin: ok");
