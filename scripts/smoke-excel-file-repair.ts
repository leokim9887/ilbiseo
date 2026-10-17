/**
 * Assert exported .xlsx table XML is Office-safe (no repair dialog triggers).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { buildWorkbook } from "../src/lib/excel";
import {
  repairExcelJsTableXml,
  sanitizeExcelText,
} from "../src/lib/excel-xlsx-repair";
import type { Task } from "../src/lib/types";
import ExcelJS from "exceljs";

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

function unzipTables(label: string, buf: ArrayBuffer): string[] {
  const dir = `/tmp/xlsx-repair-smoke/${label}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const x = `${dir}.xlsx`;
  fs.writeFileSync(x, Buffer.from(buf));
  execSync(`unzip -q -o ${JSON.stringify(x)} -d ${JSON.stringify(dir)}`);
  const td = path.join(dir, "xl/tables");
  if (!fs.existsSync(td)) return [];
  return fs
    .readdirSync(td)
    .filter((n) => n.endsWith(".xml"))
    .map((n) => fs.readFileSync(path.join(td, n), "utf8"));
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
    const raw = await wb.xlsx.writeBuffer();
    const rawXml = unzipTables("raw-bug", raw as ArrayBuffer)[0];
    ok(
      "exceljs-still-emits-totalsRowShown-1",
      /totalsRowShown="1"/.test(rawXml) && !/totalsRowCount="1"/.test(rawXml),
      rawXml.slice(0, 200),
    );
    const fixed = await repairExcelJsTableXml(raw);
    const fixedXml = unzipTables("raw-fixed", fixed)[0];
    ok(
      "repair-sets-totalsRowShown-0",
      /totalsRowShown="0"/.test(fixedXml) &&
        !/totalsRowShown="1"/.test(fixedXml),
      fixedXml.match(/totalsRowShown="[^"]+"/)?.[0],
    );
    ok(
      "repair-strips-totalsRowLabel",
      !/totalsRowLabel="Total"/.test(fixedXml),
    );
  }

  // Empty workbook: no tables (header-only sheets)
  {
    const buf = await buildWorkbook({
      tasks: [],
      calendarEvents: [],
      guidelines: [],
      habits: [],
    });
    const xmls = unzipTables("empty-app", buf);
    ok("empty-no-table-xml", xmls.length === 0, xmls.length);
    // openpyxl loads
    fs.writeFileSync("/tmp/xlsx-repair-smoke/empty-app.xlsx", Buffer.from(buf));
    execSync(
      `python3 -c "import openpyxl; openpyxl.load_workbook('/tmp/xlsx-repair-smoke/empty-app.xlsx'); print('openpyxl-empty-ok')"`,
      { stdio: "inherit" },
    );
  }

  // Mixed: active + done — tables must be repaired
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
    const xmls = unzipTables("mixed", buf);
    ok("mixed-has-tables", xmls.length === 2, xmls.length);
    for (const xml of xmls) {
      ok(
        "mixed-no-bad-totalsShown",
        !/totalsRowShown="1"/.test(xml) || /totalsRowCount="1"/.test(xml),
        xml.match(/name="[^"]+"/)?.[0],
      );
      ok("mixed-totalsShown-0", /totalsRowShown="0"/.test(xml));
    }
    // shared string must not contain control char
    const dir = "/tmp/xlsx-repair-smoke/mixed";
    const ss = path.join(dir, "xl/sharedStrings.xml");
    if (fs.existsSync(ss)) {
      const s = fs.readFileSync(ss, "utf8");
      ok("no-illegal-xml-controls", !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s));
      ok("title-sanitized", s.includes("활성할일") || s.includes("활성"));
    }
    fs.writeFileSync(path.join(OUT, "ilbiseo-excel-opens-clean.xlsx"), Buffer.from(buf));
    execSync(
      `python3 -c "import openpyxl; wb=openpyxl.load_workbook('${path.join(OUT, "ilbiseo-excel-opens-clean.xlsx")}'); print('sheets', wb.sheetnames); assert '할 일' in wb.sheetnames"`,
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
    const xmls = unzipTables("active-only", buf);
    ok("active-only-one-table", xmls.length === 1, xmls.length);
    ok("active-only-repaired", /totalsRowShown="0"/.test(xmls[0]));
  }

  fs.writeFileSync(
    path.join(OUT, "smoke-excel-file-repair.json"),
    JSON.stringify({ ok: true, at: new Date().toISOString() }, null, 2),
  );
  console.log("all passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
