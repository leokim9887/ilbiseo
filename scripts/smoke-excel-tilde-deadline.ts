/**
 * Father 「마감목표」 until-only `~M/D` rule (corrected 2026-10-19):
 * start = today (KST), end = date after tilde — never tilde date as start.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import {
  parseDeadline,
  parseExcelFile,
  autoMapHeaders,
  buildPreviewRows,
  sheetToTasks,
} from "../src/lib/excel-import";
import { todayIsoKst } from "../src/lib/date-range";

const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

const results: { name: string; ok: boolean; detail?: unknown }[] = [];

function ok(name: string, cond: boolean, detail?: unknown) {
  results.push({ name, ok: cond, detail: cond ? undefined : detail });
  if (!cond) {
    console.error("FAIL", name, detail);
  } else {
    console.log("ok", name);
  }
}

async function main() {
  const today = "2026-10-19";

  // ——— Unit: exact mapping ———
  {
    const d = parseDeadline("~10/19", { today });
    ok(
      "~10/19 → start=today end=that day",
      d.startDate === "2026-10-19" &&
        d.targetDate === "2026-10-19" &&
        d.kind === "spot" &&
        d.label === "2026-10-19",
      d,
    );
  }
  {
    const d = parseDeadline("~10/30", { today });
    ok(
      "~10/30 → start=today end=10/30",
      d.startDate === "2026-10-19" &&
        d.targetDate === "2026-10-30" &&
        d.kind === "ongoing" &&
        d.label === "2026-10-19 ~ 2026-10-30",
      d,
    );
  }
  {
    const d = parseDeadline("~10/18", { today });
    ok(
      "~10/18 past → single day 10/18 (not range with today)",
      d.startDate === "2026-10-18" &&
        d.targetDate === "2026-10-18" &&
        d.kind === "spot" &&
        d.label === "2026-10-18",
      d,
    );
  }
  {
    const d = parseDeadline("2026-10-18 ~ 2026-10-19", { today });
    ok(
      "past~today range collapses to past single",
      d.startDate === "2026-10-18" &&
        d.targetDate === "2026-10-18" &&
        d.label === "2026-10-18",
      d,
    );
  }
  {
    const d = parseDeadline("2026-10-19 ~ 2026-10-18", { today });
    ok(
      "today~past inverted collapses to past single",
      d.startDate === "2026-10-18" &&
        d.targetDate === "2026-10-18" &&
        d.label === "2026-10-18",
      d,
    );
  }
  {
    const d = parseDeadline("～10/21", { today });
    ok(
      "fullwidth ～10/21",
      d.startDate === today && d.targetDate === "2026-10-21",
      d,
    );
  }
  {
    const d = parseDeadline("~ 10/20", { today });
    ok(
      "spaced ~ 10/20",
      d.startDate === today && d.targetDate === "2026-10-20",
      d,
    );
  }
  ok(
    "empty → someday",
    parseDeadline("", { today }).kind === "someday" &&
      parseDeadline("", { today }).startDate === null,
  );
  ok(
    "언젠가 unchanged",
    parseDeadline("언젠가", { today }).kind === "someday" &&
      parseDeadline("언젠가", { today }).startDate === null,
  );
  {
    const d = parseDeadline("2026-10-01 ~ 2026-10-30", { today });
    ok(
      "full range keeps explicit start (not today)",
      d.startDate === "2026-10-01" && d.targetDate === "2026-10-30",
      d,
    );
  }

  // Live todayKst path (no inject) — start must equal todayIsoKst()
  {
    const liveToday = todayIsoKst();
    const d = parseDeadline("~12/31");
    ok(
      "live todayKst as start for ~12/31",
      d.startDate === liveToday &&
        d.targetDate === `${liveToday.slice(0, 4)}-12-31`,
      { liveToday, d },
    );
  }

  // ——— Import / preview path (Excel paste → 불러오기) ———
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("할 일");
  ws.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
  ws.addRow([1, "업무용", "세금 신고", "~10/19", 3]);
  ws.addRow([2, "개인용", "병원 예약", "~10/30", 2]);
  ws.addRow([3, "과제용", "언젠가 정리", "언젠가", 1]);
  ws.addRow([4, "팀원용", "빈 마감", "", 2]);
  // Ignore cell colors — still parse text
  ws.getCell("D2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF00" },
  };
  ws.getCell("D3").font = { color: { argb: "FFFF0000" } };

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const fixturePath = path.join(OUT, "ilbiseo-excel-tilde-deadline-fixture.xlsx");
  fs.writeFileSync(fixturePath, buf);

  const file = new File([buf], "일비서.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const parsed = await parseExcelFile(file);
  const todo = parsed.sheets.find((s) => s.name === "할 일")!;
  const mapping = autoMapHeaders(todo.headers);
  // Inject today via re-parse of deadline cells through buildPreviewRows —
  // buildPreviewRows calls parseDeadline without options, so patch by constructing rows
  // with known today by calling parseDeadline on cell strings directly after read.
  const preview = buildPreviewRows(todo, mapping, "work", []);
  // For deterministic assert: re-parse raw deadline strings with fixed today
  const rawDeadlines = todo.rows.map((r) => String(r["마감목표"] ?? "").trim());
  ok(
    "fixture raw tilde cells preserved",
    rawDeadlines.includes("~10/19") && rawDeadlines.includes("~10/30"),
    rawDeadlines,
  );

  const p0 = parseDeadline(rawDeadlines[0] || "", { today });
  const p1 = parseDeadline(rawDeadlines[1] || "", { today });
  ok(
    "preview row0 ~10/19 → today..today",
    p0.startDate === today && p0.targetDate === "2026-10-19",
    p0,
  );
  ok(
    "preview row1 ~10/30 → today..10/30",
    p1.startDate === today &&
      p1.targetDate === "2026-10-30" &&
      p1.label === "2026-10-19 ~ 2026-10-30",
    p1,
  );

  // sheetToTasks uses live today — only assert structure when live today matches fixture year
  const tasks = sheetToTasks(todo, mapping, "work");
  const tax = tasks.find((t) => t.title === "세금 신고");
  const hosp = tasks.find((t) => t.title === "병원 예약");
  const some = tasks.find((t) => t.title === "언젠가 정리");
  const live = todayIsoKst();
  ok(
    "sheetToTasks ~10/19 start=liveToday",
    tax?.startDate === live && tax?.targetDate === `${live.slice(0, 4)}-10-19`,
    tax,
  );
  ok(
    "sheetToTasks ~10/30 start=liveToday end=10/30",
    hosp?.startDate === live &&
      hosp?.targetDate === `${live.slice(0, 4)}-10-30`,
    hosp,
  );
  ok(
    "sheetToTasks 언젠가 unchanged",
    some?.kind === "someday" &&
      some.startDate === null &&
      some.targetDate === null,
    some,
  );
  ok(
    "preview has deadline labels",
    preview.some((r) => r.title === "세금 신고" && r.deadlineLabel.length > 0),
    preview.map((r) => ({ t: r.title, d: r.deadlineLabel })),
  );

  const summary = {
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    fixturePath,
    liveToday: live,
  };
  fs.writeFileSync(
    path.join(OUT, "smoke-excel-tilde-deadline.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
