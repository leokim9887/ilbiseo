import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { buildWorkbook } from "../src/lib/excel.ts";
import { buildDailyBriefing } from "../src/lib/briefing.ts";
import { todayIsoKst } from "../src/lib/date-range.ts";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";

async function main() {
  const day = todayIsoKst();
  const task = {
    id: "u1",
    title: "보고서 마감",
    category: "work",
    kind: "spot",
    startDate: day,
    targetDate: day,
    urgency: 3,
    importance: 3,
    groupKey: "보고서",
    memo: "시급성 열 없음",
    source: "manual",
    status: "active",
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  const briefing = buildDailyBriefing([task], [], new Date(), [], []);
  fs.writeFileSync(path.join(OUT, "ilbiseo-briefing-sample.txt"), briefing.plaintext);
  const buf = await buildWorkbook({
    tasks: [task],
    calendarEvents: [],
    briefing,
  });
  fs.writeFileSync(
    path.join(OUT, "ilbiseo-excel-no-urgency.xlsx"),
    Buffer.from(buf),
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const lines = [];
  for (const name of ["할 일", "한 일"]) {
    const hdrs = [];
    wb.getWorksheet(name).getRow(1).eachCell((c) => hdrs.push(String(c.value)));
    lines.push(`${name}: ${hdrs.join(" · ")}`);
  }
  fs.writeFileSync(
    path.join(OUT, "ilbiseo-excel-headers.txt"),
    lines.join("\n") + "\n",
  );
  console.log(lines.join("\n"));
  console.log(
    "briefing urgency label?",
    /시급성|시급·|\b시급\b/.test(briefing.plaintext),
  );
}

main();
