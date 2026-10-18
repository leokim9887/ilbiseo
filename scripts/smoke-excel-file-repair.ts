/**
 * Assert exported .xlsx is Office-safe (no repair-dialog triggers).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { buildWorkbook } from "../src/lib/excel";
import {
  findExcelRepairRisks,
  repairExcelJsTableXml,
  sanitizeExcelText,
} from "../src/lib/excel-xlsx-repair";
import type { Task } from "../src/lib/types";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const OUT =
  process.env.OUT_DIR || "/cursor/stores/self/media";
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

async function unzipPart(
  buf: ArrayBuffer,
  pred: (n: string) => boolean,
): Promise<{ name: string; xml: string }[]> {
  const zip = await JSZip.loadAsync(buf);
  const out: { name: string; xml: string }[] = [];
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    if (!pred(name)) continue;
    out.push({ name, xml: await zip.file(name)!.async("string") });
  }
  return out;
}

async function main() {
  ok("sanitize-controls", sanitizeExcelText("a\u0001b\u0000c") === "abc");

  // Raw ExcelJS bug still present without repair
  {
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet("t");
    s.addTable({
      name: "T1",
      ref: "A1",
      headerRow: true,
      totalsRow: false,
      columns: [
        { name: "A", filterButton: true },
        { name: "B", filterButton: false },
      ],
      rows: [[1, "x"]],
    });
    const raw = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
    const rawTables = await unzipPart(raw, (n) => n.startsWith("xl/tables/"));
    ok(
      "exceljs-still-emits-totalsRowShown-1",
      /totalsRowShown="1"/.test(rawTables[0].xml) &&
        !/totalsRowCount="1"/.test(rawTables[0].xml),
    );
    const fixed = await repairExcelJsTableXml(raw);
    const fixedTables = await unzipPart(fixed, (n) => n.startsWith("xl/tables/"));
    ok(
      "repair-sets-totalsRowShown-0",
      /totalsRowShown="0"/.test(fixedTables[0].xml) &&
        !/totalsRowShown="1"/.test(fixedTables[0].xml),
    );
    ok(
      "repair-strips-totalsRowLabel",
      !/totalsRowLabel=/.test(fixedTables[0].xml),
    );
  }

  // Empty workbook: no tables
  {
    const buf = await buildWorkbook({
      tasks: [],
      calendarEvents: [],
      guidelines: [],
      habits: [],
    });
    const tables = await unzipPart(buf as ArrayBuffer, (n) =>
      n.startsWith("xl/tables/"),
    );
    ok("empty-no-table-xml", tables.length === 0, tables.length);
    const risks = await findExcelRepairRisks(buf as ArrayBuffer);
    ok("empty-no-repair-risks", risks.length === 0, risks);
  }

  // Mixed workbook with deadline validation — must be Office-clean
  {
    const buf = await buildWorkbook({
      tasks: [
        task({ id: "1", title: "활성\u0001할일" }),
        task({
          id: "2",
          title: "기간",
          kind: "ongoing",
          startDate: "2026-12-01",
          targetDate: "2026-12-31",
        }),
        task({
          id: "3",
          title: "언젠가",
          kind: "someday",
          startDate: null,
          targetDate: null,
        }),
        task({
          id: "4",
          title: "완료",
          status: "completed",
          completedAt: now,
        }),
      ],
      calendarEvents: [],
      guidelines: [
        {
          id: "g1",
          title: "지침",
          memo: "",
          done: false,
          createdAt: now,
          completedAt: null,
        },
      ],
      habits: [],
    });

    const risks = await findExcelRepairRisks(buf as ArrayBuffer);
    ok("mixed-no-repair-risks", risks.length === 0, risks);

    const tables = await unzipPart(buf as ArrayBuffer, (n) =>
      n.startsWith("xl/tables/"),
    );
    ok("mixed-has-tables", tables.length === 2, tables.length);
    for (const t of tables) {
      ok(
        "mixed-totalsShown-0",
        /totalsRowShown="0"/.test(t.xml),
        t.name,
      );
      ok(
        "mixed-no-totalsRowFunction",
        !/totalsRowFunction=/.test(t.xml),
        t.name,
      );
    }

    const sheets = await unzipPart(buf as ArrayBuffer, (n) =>
      /^xl\/worksheets\/sheet\d+\.xml$/.test(n),
    );
    for (const s of sheets) {
      ok(
        "no-bad-dpi-" + s.name,
        !/4294967295/.test(s.xml),
        s.name,
      );
      const legacyIdx = s.xml.search(/<legacyDrawing\b/);
      const tableIdx = s.xml.search(/<tableParts\b/);
      if (legacyIdx >= 0 && tableIdx >= 0) {
        ok(
          "legacyDrawing-before-tableParts-" + s.name,
          legacyIdx < tableIdx,
        );
      }
    }

    // No comment / VML parts (notes removed — avoids OOXML order bugs)
    const zip = await JSZip.loadAsync(buf as ArrayBuffer);
    const names = Object.keys(zip.files);
    ok(
      "no-comments-parts",
      !names.some((n) => /comments\d*\.xml/.test(n)),
      names.filter((n) => n.includes("comment")),
    );
    ok(
      "no-vml-drawings",
      !names.some((n) => n.endsWith(".vml")),
      names.filter((n) => n.includes("vml")),
    );

    // dataValidation list still present with 언젠가
    const todoSheet = sheets.find((s) => s.xml.includes("IlbiseoTodo") || s.xml.includes("dataValidations"));
    // sheet1 is 할 일
    const sheet1 = sheets[0];
    ok(
      "has-deadline-list-validation",
      /<dataValidations[\s\S]*언젠가/.test(sheet1.xml),
      sheet1.xml.match(/<dataValidations[\s\S]*?<\/dataValidations>/)?.[0]?.slice(0, 200),
    );

    const outXlsx = path.join(OUT, "ilbiseo-excel-opens-clean-v2.xlsx");
    fs.writeFileSync(outXlsx, Buffer.from(buf as ArrayBuffer));
    execSync(
      `python3 -c "import openpyxl; wb=openpyxl.load_workbook('${outXlsx}'); assert '할 일' in wb.sheetnames; ws=wb['할 일']; assert ws.data_validations.dataValidation; print('openpyxl-ok', wb.sheetnames, 'dv', len(ws.data_validations.dataValidation))"`,
      { stdio: "inherit" },
    );
  }

  // One-sided empty (common): active rows, empty done → only one table
  {
    const buf = await buildWorkbook({
      tasks: [task({ id: "1", title: "만개" })],
      calendarEvents: [],
      guidelines: [],
      habits: [],
    });
    const risks = await findExcelRepairRisks(buf as ArrayBuffer);
    ok("active-only-no-risks", risks.length === 0, risks);
    const tables = await unzipPart(buf as ArrayBuffer, (n) =>
      n.startsWith("xl/tables/"),
    );
    ok("active-only-one-table", tables.length === 1, tables.length);
  }

  const result = {
    ok: true,
    at: new Date().toISOString(),
    sample: path.join(OUT, "ilbiseo-excel-opens-clean-v2.xlsx"),
  };
  fs.writeFileSync(
    path.join(OUT, "smoke-excel-file-repair.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
  console.log("all passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
