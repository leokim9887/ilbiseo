/**
 * One-shot import of 할 일 + 지침 + 습관 · 한 일 without 완료여부
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { buildWorkbook } from "../src/lib/excel";
import {
  buildWorkbookImportPlan,
  parseExcelFile,
  planToWorkbookDelta,
  workbookDeltaApplyCount,
} from "../src/lib/excel-import";
import type { SideListItem, Task } from "../src/lib/types";

const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exit(1);
  }
  console.log("ok", name, detail ?? "");
}

const now = "2026-10-17T00:00:00.000Z";

function task(p: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: "2026-12-01",
    targetDate: "2026-12-01",
    urgency: 1,
    importance: 2,
    groupKey: "g",
    memo: "",
    source: "manual",
    status: "active",
    createdAt: now,
    completedAt: null,
    ...p,
  };
}

async function main() {
  // ——— Export: 한 일 no 완료여부 ———
  const buf = await buildWorkbook({
    tasks: [
      task({ id: "1", title: "활성" }),
      task({
        id: "2",
        title: "끝난일",
        status: "completed",
        completedAt: now,
        startDate: "2026-11-01",
        targetDate: "2026-11-01",
      }),
    ],
    calendarEvents: [],
    guidelines: [
      {
        id: "g1",
        title: "아침 스트레칭",
        memo: "옛",
        done: false,
        createdAt: now,
        completedAt: null,
      },
    ],
    habits: [
      {
        id: "h1",
        title: "물 마시기",
        memo: "",
        done: false,
        createdAt: now,
        completedAt: null,
      },
    ],
  });

  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buf));
    const done = wb.getWorksheet("한 일")!;
    const headers: string[] = [];
    done.getRow(1).eachCell((c) => headers.push(String(c.value)));
    ok(
      "done-sheet-no-완료여부",
      !headers.includes("완료여부") &&
        headers.includes("중요도") &&
        headers.includes("마감목표"),
      headers,
    );
    const todo = wb.getWorksheet("전체")!;
    const th: string[] = [];
    todo.getRow(1).eachCell((c) => th.push(String(c.value)));
    ok(
      "전체-and-done-same-cols",
      th.join("|") === headers.join("|"),
      { th, headers },
    );
    ok("no-legacy-할일", !wb.getWorksheet("할 일"), null);
  }

  // ——— One-shot plan: todo sheets + 지침 + 습관 ———
  const file = new File([buf], "일비서.xlsx");
  const parsed = await parseExcelFile(file);
  ok(
    "allowlist-todo-sides",
    ["전체", "업무용", "지침", "습관"].every((n) =>
      parsed.sheets.some((s) => s.name === n),
    ),
    parsed.sheets.map((s) => s.name),
  );

  const existingTasks: Task[] = [
    task({ id: "keep", title: "활성" }), // unchanged
  ];
  const existingG: SideListItem[] = [
    {
      id: "g1",
      title: "아침 스트레칭",
      memo: "옛",
      done: false,
      createdAt: now,
      completedAt: null,
    },
  ];
  const existingH: SideListItem[] = [];

  const plan = buildWorkbookImportPlan(parsed, {
    defaultCategory: "work",
    existingTasks,
    existingGuidelines: existingG,
    existingHabits: existingH,
  });

  ok("present-all-three", plan.presentLabels.length === 3, plan.presentLabels);
  ok("todo-slice", plan.todo != null);
  ok("guide-slice", plan.guideline != null);
  ok("habit-slice", plan.habit != null);

  // 활성 unchanged; 끝난일 is on 한 일 sheet which is NOT imported — only 할 일 active
  ok(
    "todo-unchanged-active",
    plan.todo!.summary.unchanged === 1 && plan.todo!.summary.neu === 0,
    plan.todo!.summary,
  );
  ok(
    "guide-unchanged",
    plan.guideline!.summary.unchanged === 1,
    plan.guideline!.summary,
  );
  ok(
    "habit-new",
    plan.habit!.summary.neu === 1,
    plan.habit!.summary,
  );

  const delta = planToWorkbookDelta(plan);
  ok(
    "apply-count-habit-only",
    workbookDeltaApplyCount(delta) === 1 &&
      delta.habit.add[0]?.title === "물 마시기",
    delta,
  );

  // Missing sheet quiet skip
  {
    const xwb = new ExcelJS.Workbook();
    const ws = xwb.addWorksheet("할 일");
    ws.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
    ws.addRow([1, "업무용", "새할일", "언젠가", 2]);
    // no 지침 / 습관
    const ab = Buffer.from(await xwb.xlsx.writeBuffer());
    const p = await parseExcelFile(new File([ab], "partial.xlsx"));
    const plan2 = buildWorkbookImportPlan(p, {
      defaultCategory: "work",
      existingTasks: [],
      existingGuidelines: [],
      existingHabits: [],
    });
    ok(
      "missing-side-skipped",
      plan2.todo != null &&
        plan2.guideline == null &&
        plan2.habit == null &&
        plan2.presentLabels.join() === "할 일",
      plan2.presentLabels,
    );
    ok("partial-new-todo", plan2.todo!.summary.neu === 1);
  }

  // Changed guide memo
  {
    const plan3 = buildWorkbookImportPlan(parsed, {
      defaultCategory: "work",
      existingTasks: [task({ id: "keep", title: "활성" })],
      existingGuidelines: [
        {
          id: "g1",
          title: "아침 스트레칭",
          memo: "다른메모",
          done: false,
          createdAt: now,
          completedAt: null,
        },
      ],
      existingHabits: [
        {
          id: "h1",
          title: "물 마시기",
          memo: "",
          done: false,
          createdAt: now,
          completedAt: null,
        },
      ],
    });
    const d = planToWorkbookDelta(plan3);
    ok(
      "guide-changed-update",
      d.guideline.update.length === 1 &&
        d.guideline.update[0].id === "g1" &&
        d.guideline.update[0].patch.memo === "옛",
      d.guideline,
    );
    ok(
      "habit-unchanged-skip",
      d.habit.add.length === 0 && d.habit.update.length === 0,
    );
  }

  fs.writeFileSync(
    path.join(OUT, "smoke-excel-import-all-three.json"),
    JSON.stringify({ ok: true, at: new Date().toISOString() }, null, 2),
  );
  console.log("all passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
