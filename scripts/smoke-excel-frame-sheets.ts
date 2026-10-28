/**
 * Excel export: 「전체」+ 4 frame sheets (no 틀) +「한 일」;
 * import merges frame+전체 without dupes; newest-first preserved.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { buildWorkbook, EXCEL_ALL_SHEET, excelFrameSheetName } from "../src/lib/excel";
import {
  buildWorkbookImportPlan,
  parseExcelFile,
  planToWorkbookDelta,
} from "../src/lib/excel-import";
import { CATEGORY_LABEL, CATEGORY_ORDER, type Task } from "../src/lib/types";

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

function baseTask(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: "2026-10-20",
    targetDate: "2026-10-20",
    urgency: 2,
    importance: 2,
    groupKey: "g",
    memo: "",
    source: "manual",
    status: "active",
    createdAt: "2026-10-17T00:00:00.000Z",
    completedAt: null,
    ...partial,
  };
}

async function main() {
  const tasks: Task[] = [
    baseTask({
      id: "new",
      title: "최신 업무",
      category: "work",
      createdAt: "2026-10-28T12:00:00.000Z",
      startDate: "2026-10-28",
      targetDate: "2026-10-28",
    }),
    baseTask({
      id: "old",
      title: "오래된 업무",
      category: "work",
      createdAt: "2026-10-01T00:00:00.000Z",
      startDate: "2026-10-25",
      targetDate: "2026-10-25",
    }),
    baseTask({
      id: "per",
      title: "개인 세금",
      category: "personal",
      createdAt: "2026-10-20T00:00:00.000Z",
    }),
    baseTask({
      id: "proj",
      title: "과제 초안",
      category: "project",
      kind: "someday",
      startDate: null,
      targetDate: null,
    }),
    baseTask({
      id: "team",
      title: "팀 회의",
      category: "team",
    }),
    baseTask({
      id: "done1",
      title: "끝난 일",
      category: "work",
      status: "completed",
      completedAt: "2026-10-16T12:00:00.000Z",
      startDate: "2026-10-15",
      targetDate: "2026-10-15",
    }),
  ];

  const buf = await buildWorkbook({ tasks, calendarEvents: [] });
  const outPath = path.join(OUT, "ilbiseo-excel-frame-sheets-sample.xlsx");
  fs.writeFileSync(outPath, Buffer.from(buf as ArrayBuffer));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);

  const names = wb.worksheets.map((s) => s.name);
  ok("no-legacy-할일-sheet", !names.includes("할 일"), names);
  ok("has-전체", names.includes(EXCEL_ALL_SHEET), names);
  for (const cat of CATEGORY_ORDER) {
    ok(`has-frame-${cat}`, names.includes(excelFrameSheetName(cat)), names);
  }
  ok("has-한일", names.includes("한 일"), names);

  // 「전체」: with 틀, newest-first among work+others
  const all = wb.getWorksheet(EXCEL_ALL_SHEET)!;
  const allHeaders: string[] = [];
  all.getRow(1).eachCell((c) => allHeaders.push(String(c.value)));
  ok(
    "전체-has-틀",
    allHeaders.includes("틀") && allHeaders.includes("할 일"),
    allHeaders,
  );
  const allTitles: string[] = [];
  all.eachRow((row, n) => {
    if (n === 1) return;
    allTitles.push(String(row.getCell(3).value ?? ""));
  });
  ok(
    "전체-newest-first-work",
    allTitles[0]?.includes("최신 업무") &&
      allTitles.indexOf("최신 업무") < allTitles.indexOf("오래된 업무"),
    allTitles,
  );

  // Frame sheet: no 틀, only that category, newest-first
  const work = wb.getWorksheet(CATEGORY_LABEL.work)!;
  const workHeaders: string[] = [];
  work.getRow(1).eachCell((c) => workHeaders.push(String(c.value)));
  ok(
    "업무용-no-틀",
    !workHeaders.includes("틀") &&
      workHeaders.includes("할 일") &&
      workHeaders.includes("마감목표"),
    workHeaders,
  );
  const workTitles: string[] = [];
  work.eachRow((row, n) => {
    if (n === 1) return;
    workTitles.push(String(row.getCell(2).value ?? ""));
  });
  ok(
    "업무용-only-work-newest-first",
    workTitles.length === 2 &&
      workTitles[0].includes("최신 업무") &&
      workTitles[1].includes("오래된 업무"),
    workTitles,
  );

  // 「한 일」still has 틀
  const done = wb.getWorksheet("한 일")!;
  const doneHeaders: string[] = [];
  done.getRow(1).eachCell((c) => doneHeaders.push(String(c.value)));
  ok("한일-has-틀", doneHeaders.includes("틀"), doneHeaders);

  // No cell notes / comments on sheets (OOXML safety)
  for (const sh of wb.worksheets) {
    let notes = 0;
    sh.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.note) notes += 1;
      });
    });
    ok(`no-notes-${sh.name}`, notes === 0, notes);
  }

  // Import: frame + 전체 without dupes
  const file = new File([buf], "일비서.xlsx");
  const parsed = await parseExcelFile(file);
  ok(
    "import-sees-전체-and-frames",
    parsed.sheets.some((s) => s.name === "전체") &&
      parsed.sheets.some((s) => s.name === "업무용") &&
      parsed.sheets.some((s) => s.name === "지침") &&
      parsed.sheets.some((s) => s.name === "습관") &&
      !parsed.sheets.some((s) => s.name === "한 일"),
    parsed.sheets.map((s) => s.name),
  );

  const plan = buildWorkbookImportPlan(parsed, {
    defaultCategory: "work",
    existingTasks: [],
    existingGuidelines: [],
    existingHabits: [],
  });
  ok("todo-slice", plan.todo != null);
  ok(
    "import-all-active-no-dupes",
    plan.todo!.preview.filter((r) => r.delta === "new").length === 5,
    plan.todo!.summary,
  );
  const delta = planToWorkbookDelta(plan);
  ok(
    "delta-add-5",
    delta.todo.add.length === 5 &&
      delta.todo.add.some((t) => t.title === "최신 업무" && t.category === "work") &&
      delta.todo.add.some((t) => t.category === "personal"),
    delta.todo.add.map((t) => `${t.category}:${t.title}`),
  );

  // Legacy「할 일」still imports
  {
    const xwb = new ExcelJS.Workbook();
    const ws = xwb.addWorksheet("할 일");
    ws.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    ws.addRow([1, "업무용", "레거시 행", "언젠가", 2]);
    const ab = Buffer.from(await xwb.xlsx.writeBuffer());
    const legacy = await parseExcelFile(new File([ab], "legacy.xlsx"));
    const legacyPlan = buildWorkbookImportPlan(legacy, {
      defaultCategory: "work",
      existingTasks: [],
      existingGuidelines: [],
      existingHabits: [],
    });
    ok(
      "legacy-할일-imports",
      legacyPlan.todo?.preview.some(
        (r) => r.title === "레거시 행" && r.delta === "new",
      ) === true,
      legacyPlan.todo?.preview,
    );
  }

  // Dedupe: same task on 업무용 + 전체 → one row (empty app: tie → 전체)
  {
    const xwb = new ExcelJS.Workbook();
    const allSh = xwb.addWorksheet("전체");
    allSh.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    allSh.addRow([1, "업무용", "중복후보", "언젠가", 2]);
    allSh.addRow([2, "개인용", "개인만전체", "언젠가", 1]);
    const fr = xwb.addWorksheet("업무용");
    fr.addRow(["순서", "할 일", "마감목표", "중요도"]);
    fr.addRow([1, "중복후보", "언젠가", 3]); // both new → 전체 wins (imp 2)
    const ab = Buffer.from(await xwb.xlsx.writeBuffer());
    const parsed2 = await parseExcelFile(new File([ab], "dup.xlsx"));
    const plan2 = buildWorkbookImportPlan(parsed2, {
      defaultCategory: "work",
      existingTasks: [],
      existingGuidelines: [],
      existingHabits: [],
    });
    const news = plan2.todo!.preview.filter((r) => r.delta === "new");
    ok("dedupe-one-row", news.length === 2, news);
    const dup = news.find((r) => r.title === "중복후보");
    ok(
      "전체-wins-on-tie-empty-app",
      dup?.importance === 2 && dup?.category === "work",
      dup,
    );
    ok(
      "전체-only-personal-kept",
      news.some((r) => r.title === "개인만전체" && r.category === "personal"),
      news,
    );
  }

  // Father edits「전체」only; frame sheet still has stale export → take 전체
  {
    const existing: Task[] = [
      baseTask({
        id: "1",
        title: "업무A",
        category: "work",
        importance: 2,
        memo: "원본",
        startDate: "2026-10-28",
        targetDate: "2026-10-28",
      }),
    ];
    const xwb = new ExcelJS.Workbook();
    const allSh = xwb.addWorksheet("전체");
    allSh.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    allSh.addRow([1, "업무용", "업무A\n수정됨", "2026-10-28", 3]);
    const fr = xwb.addWorksheet("업무용");
    fr.addRow(["순서", "할 일", "마감목표", "중요도"]);
    fr.addRow([1, "업무A\n원본", "2026-10-28", 2]);
    const ab = Buffer.from(await xwb.xlsx.writeBuffer());
    const parsed3 = await parseExcelFile(new File([ab], "edit-all.xlsx"));
    const plan3 = buildWorkbookImportPlan(parsed3, {
      defaultCategory: "work",
      existingTasks: existing,
      existingGuidelines: [],
      existingHabits: [],
    });
    const changed = plan3.todo!.preview.find((r) => r.title === "업무A");
    ok(
      "전체-edit-beats-stale-frame",
      changed?.delta === "changed" &&
        changed.importance === 3 &&
        changed.memo === "수정됨",
      changed,
    );
  }

  // Father edits frame only;「전체」stale → take frame
  {
    const existing: Task[] = [
      baseTask({
        id: "1",
        title: "업무A",
        category: "work",
        importance: 2,
        memo: "원본",
        startDate: "2026-10-28",
        targetDate: "2026-10-28",
      }),
    ];
    const xwb = new ExcelJS.Workbook();
    const allSh = xwb.addWorksheet("전체");
    allSh.addRow(["순서", "틀", "할 일", "마감목표", "중요도"]);
    allSh.addRow([1, "업무용", "업무A\n원본", "2026-10-28", 2]);
    const fr = xwb.addWorksheet("업무용");
    fr.addRow(["순서", "할 일", "마감목표", "중요도"]);
    fr.addRow([1, "업무A\n프레임수정", "2026-10-28", 3]);
    const ab = Buffer.from(await xwb.xlsx.writeBuffer());
    const parsed4 = await parseExcelFile(new File([ab], "edit-frame.xlsx"));
    const plan4 = buildWorkbookImportPlan(parsed4, {
      defaultCategory: "work",
      existingTasks: existing,
      existingGuidelines: [],
      existingHabits: [],
    });
    const changed = plan4.todo!.preview.find((r) => r.title === "업무A");
    ok(
      "frame-edit-beats-stale-전체",
      changed?.delta === "changed" &&
        changed.importance === 3 &&
        changed.memo === "프레임수정",
      changed,
    );
  }

  console.log(
    JSON.stringify(
      {
        outPath,
        sheets: names,
        allTitles,
        workTitles,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
