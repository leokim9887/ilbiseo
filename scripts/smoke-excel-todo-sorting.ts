/**
 * Verify 「할 일」/「한 일」 AutoFilter + sortable 틀·마감목표·중요도 cell types.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  buildWorkbook,
  DEADLINE_ENTRY_HELP,
  deadlineValidationListFormula,
} from "../src/lib/excel";
import { deadlineExcelParts, todayIsoKst } from "../src/lib/date-range";
import { parseDeadline } from "../src/lib/excel-import";
import type { Task } from "../src/lib/types";

const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

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
  const checks: { name: string; ok: boolean; detail: unknown }[] = [];
  const ok = (name: string, cond: boolean, detail: unknown = null) => {
    checks.push({ name, ok: Boolean(cond), detail });
    if (!cond) throw new Error(`${name}: ${JSON.stringify(detail)}`);
  };

  // Unit: deadline parts
  {
    const single = deadlineExcelParts(
      baseTask({ id: "a", title: "단일", startDate: "2026-11-01", targetDate: "2026-11-01" }),
    );
    ok("parts-single-date", single.kind === "date" && single.numFmt === "yyyy-mm-dd", single);

    const range = deadlineExcelParts(
      baseTask({
        id: "b",
        title: "구간",
        kind: "ongoing",
        startDate: "2026-11-01",
        targetDate: "2026-11-15",
      }),
    );
    ok(
      "parts-range-text",
      range.kind === "rangeText" &&
        range.start === "2026-11-01" &&
        range.end === "2026-11-15" &&
        range.value === "2026-11-01 ~ 2026-11-15",
      range,
    );

    const someday = deadlineExcelParts(
      baseTask({
        id: "c",
        title: "언젠가",
        kind: "someday",
        startDate: null,
        targetDate: null,
      }),
    );
    ok("parts-someday", someday.kind === "someday" && someday.value === "언젠가", someday);
  }

  const tasks: Task[] = [
    baseTask({
      id: "1",
      title: "팀 회의",
      category: "team",
      importance: 1,
      startDate: "2026-10-25",
      targetDate: "2026-10-25",
    }),
    baseTask({
      id: "2",
      title: "개인 세금",
      category: "personal",
      importance: 3,
      kind: "ongoing",
      startDate: "2026-10-10",
      targetDate: "2026-10-30",
    }),
    baseTask({
      id: "3",
      title: "업무 보고",
      category: "work",
      importance: 2,
      startDate: "2026-10-18",
      targetDate: "2026-10-18",
    }),
    baseTask({
      id: "4",
      title: "과제 초안",
      category: "project",
      importance: 2,
      kind: "someday",
      startDate: null,
      targetDate: null,
    }),
    baseTask({
      id: "5",
      title: "끝난 일",
      category: "work",
      importance: 1,
      status: "completed",
      completedAt: "2026-10-16T12:00:00.000Z",
      startDate: "2026-10-15",
      targetDate: "2026-10-15",
    }),
  ];

  const buf = await buildWorkbook({ tasks, calendarEvents: [] });
  const outPath = path.join(OUT, "ilbiseo-excel-todo-sorting-sample.xlsx");
  fs.writeFileSync(outPath, Buffer.from(buf as ArrayBuffer));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);

  const wantFilter: Record<string, boolean> = {
    순서: false,
    틀: true,
    "할일 LIST UP": false,
    마감목표: true,
    중요도: true,
  };

  const tableNameBySheet: Record<string, string> = {
    "할 일": "IlbiseoTodo",
    "한 일": "IlbiseoDone",
  };

  for (const name of ["할 일", "한 일"] as const) {
    const sh = wb.getWorksheet(name);
    ok(`sheet-${name}`, Boolean(sh), null);
    const table = sh!.getTable(tableNameBySheet[name]);
    ok(`table-${name}`, Boolean(table), tableNameBySheet[name]);
    const colCount = Object.keys(wantFilter).length;
    const buttons: Record<string, boolean> = {};
    for (let i = 0; i < colCount; i++) {
      const col = table.getColumn(i);
      buttons[col.name] = Boolean(col.filterButton);
    }
    ok(
      `filter-buttons-${name}`,
      Object.keys(wantFilter).every((k) => buttons[k] === wantFilter[k]),
      buttons,
    );
    ok(
      `no-sort-cols-hidden-${name}`,
      buttons["순서"] === false && buttons["할일 LIST UP"] === false,
      buttons,
    );
    ok(
      `sortable-cols-shown-${name}`,
      buttons["틀"] === true &&
        buttons["마감목표"] === true &&
        buttons["중요도"] === true,
      buttons,
    );
    ok(
      `${name}-no-완료여부-col`,
      !Object.prototype.hasOwnProperty.call(buttons, "완료여부"),
      buttons,
    );
  }

  const todo = wb.getWorksheet("할 일")!;
  const frames: string[] = [];
  const importances: unknown[] = [];
  const deadlines: { type: string; numFmt?: string; iso?: string; text?: string }[] =
    [];

  // After load, column keys are gone — use positions: 틀=2 마감=4 중요도=5
  todo.eachRow((row, n) => {
    if (n === 1) return;
    frames.push(String(row.getCell(2).value ?? ""));
    const imp = row.getCell(5).value;
    importances.push(imp);
    const dCell = row.getCell(4);
    const v = dCell.value;
    if (v instanceof Date) {
      const iso = v.toISOString().slice(0, 10);
      deadlines.push({ type: "date", numFmt: dCell.numFmt, iso });
    } else {
      deadlines.push({ type: typeof v, text: String(v ?? ""), numFmt: dCell.numFmt });
    }
  });

  ok(
    "frames-plain-labels",
    frames.every((f) =>
      ["업무용", "개인용", "과제용", "팀원용"].includes(f),
    ),
    frames,
  );
  ok(
    "importance-numbers",
    importances.every((v) => typeof v === "number"),
    importances,
  );
  ok(
    "has-real-dates",
    deadlines.some((d) => d.type === "date"),
    deadlines,
  );
  ok(
    "range-as-plain-text",
    deadlines.some(
      (d) =>
        d.type === "string" &&
        typeof d.text === "string" &&
        d.text.includes("2026-10-10") &&
        d.text.includes("2026-10-30") &&
        d.text.includes("~"),
    ),
    deadlines,
  );
  ok(
    "someday-text",
    deadlines.some((d) => d.text === "언젠가"),
    deadlines,
  );

  // SheetJS import path (raw:false) should see formatted range text
  const xwb = XLSX.read(Buffer.from(buf as ArrayBuffer), {
    type: "buffer",
    cellDates: true,
    raw: false,
  });
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(xwb.Sheets["할 일"], {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  const hdr = (aoa[0] ?? []).map(String);
  const deadlineIdx = hdr.indexOf("마감목표");
  ok("xlsx-has-deadline-col", deadlineIdx >= 0, hdr);
  const deadlineTexts = aoa.slice(1).map((r) => String(r[deadlineIdx] ?? ""));
  ok(
    "xlsx-formatted-range-visible",
    deadlineTexts.some((t) => t.includes("~") && t.includes("2026-10-30")),
    deadlineTexts,
  );
  ok(
    "xlsx-someday-visible",
    deadlineTexts.some((t) => t === "언젠가"),
    deadlineTexts,
  );

  // Excel-native 마감목표 entry aids (list validation + header note)
  {
    const formula = deadlineValidationListFormula(todayIsoKst());
    ok(
      "deadline-list-has-언젠가",
      formula.includes("언젠가") && formula.startsWith('"') && formula.endsWith('"'),
      formula,
    );
    const dvModel = (todo as unknown as { dataValidations?: { model?: Record<string, unknown> } })
      .dataValidations?.model;
    const dvEntries = dvModel ? Object.entries(dvModel) : [];
    ok("deadline-validation-present", dvEntries.length >= 1, dvEntries.map(([k]) => k));
    const hasList = dvEntries.some(([, v]) => {
      const dv = v as { type?: string; formulae?: string[] };
      return (
        dv.type === "list" &&
        Array.isArray(dv.formulae) &&
        String(dv.formulae[0] ?? "").includes("언젠가")
      );
    });
    ok("deadline-validation-list-언젠가", hasList, dvEntries);
    const note = todo.getCell(1, 4).note;
    const noteText =
      typeof note === "string"
        ? note
        : Array.isArray((note as { texts?: { text?: string }[] })?.texts)
          ? ((note as { texts: { text?: string }[] }).texts)
              .map((t) => t.text ?? "")
              .join("")
          : "";
    ok(
      "deadline-header-note",
      noteText.includes("언젠가") &&
        (noteText.includes("~") || noteText.includes("구간")),
      { noteText: noteText.slice(0, 200), help: DEADLINE_ENTRY_HELP.slice(0, 80) },
    );
    ok(
      "deadline-help-mentions-언젠가",
      DEADLINE_ENTRY_HELP.includes("언젠가"),
      DEADLINE_ENTRY_HELP.slice(0, 120),
    );
  }

  // Import round-trip: list options → exact app 마감 shape
  {
    const someday = parseDeadline("언젠가");
    ok(
      "import-언젠가",
      someday.kind === "someday" &&
        someday.startDate === null &&
        someday.targetDate === null,
      someday,
    );
    const day = parseDeadline("2026-10-17");
    ok(
      "import-single-day",
      day.kind === "spot" &&
        day.startDate === "2026-10-17" &&
        day.targetDate === "2026-10-17",
      day,
    );
    const range = parseDeadline("2026-10-17 ~ 2026-10-24");
    ok(
      "import-range",
      range.kind === "ongoing" &&
        range.startDate === "2026-10-17" &&
        range.targetDate === "2026-10-24",
      range,
    );
    // Real date must not become 언젠가
    const notCorrupt = parseDeadline("2026-11-01");
    ok(
      "import-date-not-언젠가",
      notCorrupt.kind === "spot" && notCorrupt.startDate === "2026-11-01",
      notCorrupt,
    );
  }

  const result = {
    ok: checks.every((c) => c.ok),
    sample: outPath,
    checks,
    frames,
    importances,
    deadlines,
    deadlineTexts,
  };
  fs.writeFileSync(
    path.join(OUT, "smoke-excel-todo-sorting.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
