/**
 * Verify 「할 일」/「한 일」 AutoFilter + sortable 틀·마감목표·중요도 cell types.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { buildWorkbook } from "../src/lib/excel";
import { deadlineExcelParts } from "../src/lib/date-range";
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
      "parts-range-start-sort",
      range.kind === "date" &&
        range.start === "2026-11-01" &&
        range.end === "2026-11-15" &&
        range.numFmt.includes("2026-11-15"),
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
    완료여부: false,
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
    const buttons: Record<string, boolean> = {};
    for (let i = 0; i < 6; i++) {
      const col = table.getColumn(i);
      buttons[col.name] = Boolean(col.filterButton);
    }
    ok(
      `filter-buttons-${name}`,
      Object.keys(wantFilter).every((k) => buttons[k] === wantFilter[k]),
      buttons,
    );
    // Arrows via Table column hiddenButton — not sheet-level AutoFilter
    ok(
      `no-sort-cols-hidden-${name}`,
      buttons["순서"] === false &&
        buttons["할일 LIST UP"] === false &&
        buttons["완료여부"] === false,
      buttons,
    );
    ok(
      `sortable-cols-shown-${name}`,
      buttons["틀"] === true &&
        buttons["마감목표"] === true &&
        buttons["중요도"] === true,
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
    "range-keeps-end-in-numFmt",
    deadlines.some(
      (d) =>
        d.type === "date" &&
        typeof d.numFmt === "string" &&
        d.numFmt.includes("~") &&
        d.numFmt.includes("2026-10-30"),
    ),
    deadlines,
  );
  ok(
    "range-sort-key-is-start",
    deadlines.some((d) => d.type === "date" && d.iso === "2026-10-10"),
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
