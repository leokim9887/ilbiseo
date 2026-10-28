/**
 * Regression: preview→apply must commit 할 일 + 지침 + 습관 together.
 * Simulates the stale-closure bug where sequential persist left only 습관.
 */
import ExcelJS from "exceljs";
import {
  applyWorkbookDeltaToState,
  applyWorkbookReplaceToState,
  buildWorkbookImportPlan,
  parseExcelFile,
  planToWorkbookDelta,
  workbookDeltaApplyCount,
  type WorkbookDeltaCommit,
} from "../src/lib/excel-import";
import { createEmptyState } from "../src/lib/storage";
import type { AppState, SideListItem, Task } from "../src/lib/types";

function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exit(1);
  }
  console.log("ok", name, detail ?? "");
}

function baseTask(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: "2026-10-28",
    targetDate: "2026-10-28",
    urgency: 2,
    importance: 2,
    groupKey: "g",
    memo: "원본",
    source: "manual",
    status: "active",
    createdAt: "2026-10-28T00:00:00.000Z",
    completedAt: null,
    ...partial,
  };
}

function side(
  partial: Partial<SideListItem> & Pick<SideListItem, "id" | "title">,
): SideListItem {
  return {
    memo: "",
    done: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    completedAt: null,
    ...partial,
  };
}

/** Reproduce broken sequential last-write-wins (closure over same `state`). */
function brokenSequentialApply(
  state: AppState,
  delta: WorkbookDeltaCommit,
): AppState {
  let snap = state; // frozen like React useCallback([state])
  let last = snap;
  if (delta.todo.add.length || delta.todo.update.length) {
    // each call spreads the SAME snap — later writes drop earlier fields
    last = {
      ...snap,
      tasks: [...snap.tasks, ...delta.todo.add],
    };
  }
  if (delta.guideline.add.length || delta.guideline.update.length) {
    last = {
      ...snap,
      guidelines: [...snap.guidelines, ...delta.guideline.add],
    };
  }
  if (delta.habit.add.length || delta.habit.update.length) {
    last = {
      ...snap,
      habits: [...snap.habits, ...delta.habit.add],
    };
  }
  return last;
}

async function parseWb(wb: ExcelJS.Workbook) {
  const ab = Buffer.from(await wb.xlsx.writeBuffer());
  return parseExcelFile(
    new File(
      [ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength)],
      "apply.xlsx",
    ),
  );
}

async function main() {
  const existingTasks: Task[] = [
    baseTask({ id: "w1", title: "업무A", category: "work" }),
  ];
  const existingGuides: SideListItem[] = [
    side({ id: "g1", title: "기존지침" }),
  ];
  const existingHabits: SideListItem[] = [];

  const wb = new ExcelJS.Workbook();
  const all = wb.addWorksheet("전체");
  all.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
  all.addRow([1, "업무용", "업무A\n전체수정", "2026-10-28", 3]);
  all.addRow([2, "개인용", "신규개인", "언젠가", 1]);
  const work = wb.addWorksheet("업무용");
  work.addRow(["순서", "할 일", "마감목표", "중요도"]);
  work.addRow([1, "업무A\n원본", "2026-10-28", 2]); // stale twin
  for (const name of ["개인용", "과제용", "팀원용"]) {
    const s = wb.addWorksheet(name);
    s.addRow(["순서", "할 일", "마감목표", "중요도"]);
  }
  const g = wb.addWorksheet("지침");
  g.addRow(["순서", "내용", "메모"]);
  g.addRow([1, "기존지침", ""]);
  g.addRow([2, "새지침", "메모"]);
  const h = wb.addWorksheet("습관");
  h.addRow(["순서", "내용", "메모"]);
  h.addRow([1, "아침산책", "매일"]);

  const parsed = await parseWb(wb);
  const plan = buildWorkbookImportPlan(parsed, {
    defaultCategory: "work",
    existingTasks,
    existingGuidelines: existingGuides,
    existingHabits,
  });
  const delta = planToWorkbookDelta(plan);

  ok(
    "preview-has-todo-guide-habit",
    (plan.todo?.summary.neu ?? 0) + (plan.todo?.summary.changed ?? 0) >= 2 &&
      (plan.guideline?.summary.neu ?? 0) >= 1 &&
      (plan.habit?.summary.neu ?? 0) >= 1,
    {
      todo: plan.todo?.summary,
      guide: plan.guideline?.summary,
      habit: plan.habit?.summary,
      applyCount: workbookDeltaApplyCount(delta),
    },
  );

  const base: AppState = {
    ...createEmptyState(),
    tasks: existingTasks,
    guidelines: existingGuides,
    habits: existingHabits,
  };

  // Prove the old sequential path only kept 습관
  const broken = brokenSequentialApply(base, delta);
  ok(
    "broken-sequential-only-habit",
    broken.habits.some((i) => i.title === "아침산책") &&
      !broken.tasks.some((t) => t.title === "신규개인") &&
      !broken.guidelines.some((i) => i.title === "새지침") &&
      broken.tasks.find((t) => t.id === "w1")?.memo === "원본",
    {
      taskTitles: broken.tasks.map((t) => t.title),
      guides: broken.guidelines.map((i) => i.title),
      habits: broken.habits.map((i) => i.title),
    },
  );

  // Fixed atomic apply keeps all three
  const fixed = applyWorkbookDeltaToState(base, delta);
  ok(
    "atomic-todo-changed",
    fixed.tasks.find((t) => t.id === "w1")?.memo === "전체수정" &&
      fixed.tasks.find((t) => t.id === "w1")?.importance === 3,
    fixed.tasks.find((t) => t.id === "w1"),
  );
  ok(
    "atomic-todo-new",
    fixed.tasks.some(
      (t) => t.title === "신규개인" && t.category === "personal",
    ),
    fixed.tasks.map((t) => `${t.category}:${t.title}`),
  );
  ok(
    "atomic-guideline-new",
    fixed.guidelines.some((i) => i.title === "새지침"),
    fixed.guidelines.map((i) => i.title),
  );
  ok(
    "atomic-habit-new",
    fixed.habits.some((i) => i.title === "아침산책"),
    fixed.habits.map((i) => i.title),
  );
  ok(
    "atomic-keeps-existing-guide",
    fixed.guidelines.some((i) => i.id === "g1" && i.title === "기존지침"),
    fixed.guidelines,
  );

  // Replace mode atomic
  const replaceTasks = [
    baseTask({
      id: "r1",
      title: "교체업무",
      category: "work",
      memo: "",
    }),
  ];
  const replaced = applyWorkbookReplaceToState(base, {
    tasks: replaceTasks,
    guidelines: [side({ id: "ng", title: "교체지침" })],
    habits: [side({ id: "nh", title: "교체습관" })],
  });
  ok(
    "replace-atomic-all",
    replaced.tasks.length === 1 &&
      replaced.tasks[0]!.title === "교체업무" &&
      replaced.guidelines.length === 1 &&
      replaced.guidelines[0]!.title === "교체지침" &&
      replaced.habits.length === 1 &&
      replaced.habits[0]!.title === "교체습관",
    {
      tasks: replaced.tasks.map((t) => t.title),
      g: replaced.guidelines.map((i) => i.title),
      h: replaced.habits.map((i) => i.title),
    },
  );

  console.log(JSON.stringify({ ok: true }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
