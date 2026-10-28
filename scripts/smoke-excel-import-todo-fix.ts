/**
 * Round-trip: export layout → edit「전체」and/or frame sheets → import delta.
 * Guards the content-aware merge (stale twin sheets must not drop edits).
 */
import ExcelJS from "exceljs";
import {
  buildWorkbookImportPlan,
  parseExcelFile,
  planToWorkbookDelta,
} from "../src/lib/excel-import";
import type { SideListItem, Task } from "../src/lib/types";

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

async function parseWb(wb: ExcelJS.Workbook, name: string) {
  const ab = Buffer.from(await wb.xlsx.writeBuffer());
  return parseExcelFile(
    new File(
      [ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength)],
      name,
    ),
  );
}

function addEmptyFrames(wb: ExcelJS.Workbook, skip: string[] = []) {
  for (const name of ["업무용", "개인용", "과제용", "팀원용"]) {
    if (skip.includes(name) || wb.getWorksheet(name)) continue;
    const s = wb.addWorksheet(name);
    s.addRow(["순서", "할 일", "마감목표", "중요도"]);
  }
}

async function main() {
  const existing: Task[] = [
    baseTask({ id: "w1", title: "업무A", category: "work" }),
    baseTask({
      id: "p1",
      title: "개인B",
      category: "personal",
      importance: 1,
      memo: "",
    }),
  ];
  const guides: SideListItem[] = [
    {
      id: "g1",
      title: "기존지침",
      memo: "",
      done: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
  ];
  const habits: SideListItem[] = [];

  // 1) Edit「전체」only — stale frame must not hide the change
  {
    const wb = new ExcelJS.Workbook();
    const all = wb.addWorksheet("전체");
    all.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    all.addRow([1, "업무용", "업무A\n전체수정", "2026-10-28", 3]);
    all.addRow([2, "개인용", "개인B", "2026-10-28", 1]);
    const work = wb.addWorksheet("업무용");
    work.addRow(["순서", "할 일", "마감목표", "중요도"]);
    work.addRow([1, "업무A\n원본", "2026-10-28", 2]);
    const personal = wb.addWorksheet("개인용");
    personal.addRow(["순서", "할 일", "마감목표", "중요도"]);
    personal.addRow([1, "개인B", "2026-10-28", 1]);
    addEmptyFrames(wb);
    const plan = buildWorkbookImportPlan(await parseWb(wb, "all-edit.xlsx"), {
      defaultCategory: "work",
      existingTasks: existing,
      existingGuidelines: guides,
      existingHabits: habits,
    });
    const row = plan.todo!.preview.find((r) => r.title === "업무A");
    ok(
      "전체-edit-imported",
      row?.delta === "changed" &&
        row.importance === 3 &&
        row.memo === "전체수정" &&
        row.category === "work",
      row,
    );
    const delta = planToWorkbookDelta(plan);
    ok(
      "전체-edit-delta-update",
      delta.todo.update.length === 1 &&
        delta.todo.update[0]!.id === "w1" &&
        delta.todo.update[0]!.patch.importance === 3,
      delta.todo.update,
    );
  }

  // 2) Edit frame only — stale「전체」must not hide the change
  {
    const wb = new ExcelJS.Workbook();
    const all = wb.addWorksheet("전체");
    all.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    all.addRow([1, "업무용", "업무A\n원본", "2026-10-28", 2]);
    all.addRow([2, "개인용", "개인B", "2026-10-28", 1]);
    const work = wb.addWorksheet("업무용");
    work.addRow(["순서", "할 일", "마감목표", "중요도"]);
    work.addRow([1, "업무A\n프레임수정", "2026-10-28", 3]);
    const personal = wb.addWorksheet("개인용");
    personal.addRow(["순서", "할 일", "마감목표", "중요도"]);
    personal.addRow([1, "개인B", "2026-10-28", 1]);
    addEmptyFrames(wb);
    const plan = buildWorkbookImportPlan(await parseWb(wb, "frame-edit.xlsx"), {
      defaultCategory: "work",
      existingTasks: existing,
      existingGuidelines: guides,
      existingHabits: habits,
    });
    const row = plan.todo!.preview.find((r) => r.title === "업무A");
    ok(
      "frame-edit-imported",
      row?.delta === "changed" &&
        row.importance === 3 &&
        row.memo === "프레임수정",
      row,
    );
  }

  // 3) New row on「전체」only lands in correct 틀
  {
    const wb = new ExcelJS.Workbook();
    const all = wb.addWorksheet("전체");
    all.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    all.addRow([1, "업무용", "업무A\n원본", "2026-10-28", 2]);
    all.addRow([2, "개인용", "개인B", "2026-10-28", 1]);
    all.addRow([3, "과제용", "신규과제", "언젠가", 2]);
    const work = wb.addWorksheet("업무용");
    work.addRow(["순서", "할 일", "마감목표", "중요도"]);
    work.addRow([1, "업무A\n원본", "2026-10-28", 2]);
    const personal = wb.addWorksheet("개인용");
    personal.addRow(["순서", "할 일", "마감목표", "중요도"]);
    personal.addRow([1, "개인B", "2026-10-28", 1]);
    addEmptyFrames(wb);
    const plan = buildWorkbookImportPlan(await parseWb(wb, "all-new.xlsx"), {
      defaultCategory: "work",
      existingTasks: existing,
      existingGuidelines: guides,
      existingHabits: habits,
    });
    ok(
      "전체-new-row-correct-틀",
      plan.todo!.preview.some(
        (r) =>
          r.title === "신규과제" &&
          r.category === "project" &&
          r.delta === "new",
      ),
      plan.todo!.preview,
    );
  }

  // 4) New row on frame only (no「틀」column) → forceCategory
  {
    const wb = new ExcelJS.Workbook();
    const all = wb.addWorksheet("전체");
    all.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    all.addRow([1, "업무용", "업무A\n원본", "2026-10-28", 2]);
    all.addRow([2, "개인용", "개인B", "2026-10-28", 1]);
    const work = wb.addWorksheet("업무용");
    work.addRow(["순서", "할 일", "마감목표", "중요도"]);
    work.addRow([1, "업무A\n원본", "2026-10-28", 2]);
    work.addRow([2, "새업무행", "언젠가", 1]);
    const personal = wb.addWorksheet("개인용");
    personal.addRow(["순서", "할 일", "마감목표", "중요도"]);
    personal.addRow([1, "개인B", "2026-10-28", 1]);
    addEmptyFrames(wb);
    const plan = buildWorkbookImportPlan(await parseWb(wb, "frame-new.xlsx"), {
      defaultCategory: "personal",
      existingTasks: existing,
      existingGuidelines: guides,
      existingHabits: habits,
    });
    ok(
      "frame-new-row-forceCategory",
      plan.todo!.preview.some(
        (r) =>
          r.title === "새업무행" && r.category === "work" && r.delta === "new",
      ),
      plan.todo!.preview,
    );
  }

  // 5) 지침/습관 batch still works alongside todos
  {
    const wb = new ExcelJS.Workbook();
    const all = wb.addWorksheet("전체");
    all.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    all.addRow([1, "업무용", "업무A\n원본", "2026-10-28", 2]);
    const work = wb.addWorksheet("업무용");
    work.addRow(["순서", "할 일", "마감목표", "중요도"]);
    work.addRow([1, "업무A\n원본", "2026-10-28", 2]);
    addEmptyFrames(wb);
    const g = wb.addWorksheet("지침");
    g.addRow(["순서", "내용", "메모"]);
    g.addRow([1, "기존지침", ""]);
    g.addRow([2, "새지침", "메모"]);
    const h = wb.addWorksheet("습관");
    h.addRow(["순서", "내용", "메모"]);
    h.addRow([1, "아침산책", "매일"]);
    const plan = buildWorkbookImportPlan(await parseWb(wb, "sides.xlsx"), {
      defaultCategory: "work",
      existingTasks: existing,
      existingGuidelines: guides,
      existingHabits: habits,
    });
    ok(
      "todo-unchanged-ok",
      plan.todo!.summary.unchanged >= 1 && plan.todo!.summary.neu === 0,
      plan.todo!.summary,
    );
    ok(
      "guideline-new",
      plan.guideline?.preview.some(
        (r) => r.title === "새지침" && r.delta === "new",
      ) === true,
      plan.guideline?.preview,
    );
    ok(
      "habit-new",
      plan.habit?.preview.some(
        (r) => r.title === "아침산책" && r.delta === "new",
      ) === true,
      plan.habit?.preview,
    );
    const delta = planToWorkbookDelta(plan);
    ok(
      "sides-delta-commit",
      delta.guideline.add.length === 1 && delta.habit.add.length === 1,
      delta,
    );
  }

  // 6) Legacy「할 일」still imports
  {
    const wb = new ExcelJS.Workbook();
    const legacy = wb.addWorksheet("할 일");
    legacy.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    legacy.addRow([1, "팀원용", "레거시행", "언젠가", 2]);
    const plan = buildWorkbookImportPlan(await parseWb(wb, "legacy.xlsx"), {
      defaultCategory: "work",
      existingTasks: [],
      existingGuidelines: [],
      existingHabits: [],
    });
    ok(
      "legacy-할일",
      plan.todo?.preview.some(
        (r) =>
          r.title === "레거시행" && r.category === "team" && r.delta === "new",
      ) === true,
      plan.todo?.preview,
    );
  }

  console.log(JSON.stringify({ ok: true }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
