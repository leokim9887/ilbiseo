import fs from "fs";
import ExcelJS from "exceljs";
import { buildWorkbook } from "../src/lib/excel";

async function main() {
  const out = process.argv[2] || "/tmp/done-headers.json";
  const now = new Date().toISOString();
  const buf = await buildWorkbook({
    tasks: [
      {
        id: "1",
        title: "끝난 작업",
        category: "work",
        kind: "spot",
        startDate: "2026-11-01",
        targetDate: "2026-11-01",
        urgency: 1,
        importance: 2,
        groupKey: "g",
        memo: "",
        source: "manual",
        status: "completed",
        createdAt: now,
        completedAt: now,
      },
    ],
    calendarEvents: [],
    guidelines: [],
    habits: [],
  });
  const xwb = new ExcelJS.Workbook();
  await xwb.xlsx.load(Buffer.from(buf));
  const headers: string[] = [];
  xwb.getWorksheet("한 일")!.getRow(1).eachCell((c) => {
    headers.push(String(c.value));
  });
  fs.writeFileSync(out, JSON.stringify(headers));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
