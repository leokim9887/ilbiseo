/**
 * Excel import renewal: 틀 classification · deadline parse · similarity notice
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { buildWorkbook } from "../src/lib/excel";
import {
  autoMapHeaders,
  buildPreviewRows,
  mappingHasCategory,
  parseDeadline,
  parseExcelFile,
  sheetToTasks,
  summarizeImportSimilarities,
  type ParsedSheet,
} from "../src/lib/excel-import";
import type { Task } from "../src/lib/types";

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
    startDate: "2026-10-17",
    targetDate: "2026-10-17",
    urgency: 1,
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
  // ——— parseDeadline unit cases ———
  const cases: { raw: string; start: string | null; end: string | null; kind: string }[] = [
    { raw: "2026-10-17", start: "2026-10-17", end: "2026-10-17", kind: "spot" },
    {
      raw: "2026-10-17 ~ 2026-10-20",
      start: "2026-10-17",
      end: "2026-10-20",
      kind: "ongoing",
    },
    { raw: "10/17/26", start: "2026-10-17", end: "2026-10-17", kind: "spot" },
    { raw: "10/17/2026", start: "2026-10-17", end: "2026-10-17", kind: "spot" },
    {
      raw: "2026년 10월 17일",
      start: "2026-10-17",
      end: "2026-10-17",
      kind: "spot",
    },
    {
      raw: "2026. 10. 17",
      start: "2026-10-17",
      end: "2026-10-17",
      kind: "spot",
    },
    { raw: "46312", start: "2026-10-17", end: "2026-10-17", kind: "spot" },
    {
      raw: "2026-10-17T00:00:00.000Z",
      start: "2026-10-17",
      end: "2026-10-17",
      kind: "spot",
    },
    { raw: "언젠가", start: null, end: null, kind: "someday" },
    { raw: "", start: null, end: null, kind: "someday" },
  ];
  for (const c of cases) {
    const d = parseDeadline(c.raw);
    ok(
      `deadline:${c.raw || "(empty)"}`,
      d.startDate === c.start &&
        d.targetDate === c.end &&
        d.kind === c.kind,
      d,
    );
  }

  // Father until-only `~M/D` (corrected: start=today KST, end=tilde date)
  {
    const today = "2026-10-19";
    const a = parseDeadline("~10/19", { today });
    ok(
      "until:~10/19→today..today",
      a.startDate === today &&
        a.targetDate === "2026-10-19" &&
        a.kind === "spot",
      a,
    );
    const b = parseDeadline("~10/30", { today });
    ok(
      "until:~10/30→today..10/30",
      b.startDate === today &&
        b.targetDate === "2026-10-30" &&
        b.label === "2026-10-19 ~ 2026-10-30",
      b,
    );
    const c = parseDeadline("~10/18", { today });
    ok(
      "until:~10/18 past→single 10/18",
      c.startDate === "2026-10-18" &&
        c.targetDate === "2026-10-18" &&
        c.label === "2026-10-18" &&
        c.kind === "spot",
      c,
    );
  }

  // ——— Round-trip via buildWorkbook + parseExcelFile ———
  const exportTasks: Task[] = [
    baseTask({
      id: "1",
      title: "단일 업무",
      category: "work",
      startDate: "2026-10-17",
      targetDate: "2026-10-17",
    }),
    baseTask({
      id: "2",
      title: "기간 개인",
      category: "personal",
      kind: "ongoing",
      startDate: "2026-10-17",
      targetDate: "2026-10-20",
      importance: 3,
    }),
    baseTask({
      id: "3",
      title: "언젠가 과제",
      category: "project",
      kind: "someday",
      startDate: null,
      targetDate: null,
    }),
    baseTask({
      id: "4",
      title: "팀 회의 자료",
      category: "team",
      startDate: "2026-11-01",
      targetDate: "2026-11-01",
    }),
  ];
  const buf = await buildWorkbook({
    tasks: exportTasks,
    calendarEvents: [],
  });
  const samplePath = path.join(OUT, "ilbiseo-excel-import-renewal-sample.xlsx");
  fs.writeFileSync(samplePath, Buffer.from(buf));

  const file = new File([buf], "일비서.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const wb = await parseExcelFile(file);
  const todo = wb.sheets.find((s) => s.name === "할 일");
  ok("has-todo-sheet", Boolean(todo), wb.sheets.map((s) => s.name));
  const mapping = autoMapHeaders(todo!.headers);
  ok("maps-틀", mappingHasCategory(mapping) && mapping["틀"] === "category", mapping);

  const imported = sheetToTasks(todo!, mapping, "work");
  ok("import-count", imported.length === 4, imported.map((t) => t.title));

  const byTitle = Object.fromEntries(imported.map((t) => [t.title, t]));
  ok(
    "틀-work",
    byTitle["단일 업무"]?.category === "work" &&
      byTitle["단일 업무"]?.startDate === "2026-10-17",
    byTitle["단일 업무"],
  );
  ok(
    "틀-personal-range",
    byTitle["기간 개인"]?.category === "personal" &&
      byTitle["기간 개인"]?.kind === "ongoing" &&
      byTitle["기간 개인"]?.startDate === "2026-10-17" &&
      byTitle["기간 개인"]?.targetDate === "2026-10-20",
    byTitle["기간 개인"],
  );
  ok(
    "틀-project-someday",
    byTitle["언젠가 과제"]?.category === "project" &&
      byTitle["언젠가 과제"]?.kind === "someday" &&
      byTitle["언젠가 과제"]?.startDate == null,
    byTitle["언젠가 과제"],
  );
  ok("틀-team", byTitle["팀 회의 자료"]?.category === "team", byTitle["팀 회의 자료"]);

  // ——— Locale / serial fixtures via ExcelJS ———
  {
    const xwb = new ExcelJS.Workbook();
    const ws = xwb.addWorksheet("할 일");
    ws.addRow([
      "순서",
      "틀",
      "할일 LIST UP",
      "마감목표",
      "중요도",
      "완료여부",
    ]);
    const r1 = ws.addRow([
      1,
      "업무용",
      "로케일날짜",
      new Date(Date.UTC(2026, 9, 17)),
      2,
      "",
    ]);
    r1.getCell(4).numFmt = "m/d/yy";
    ws.addRow([2, "개인용", "시리얼", 46312, 2, ""]);
    ws.addRow([3, "과제용", "한글날짜", "2026년 10월 18일", 1, ""]);
    const ab = Buffer.from(await xwb.xlsx.writeBuffer());
    const parsed = await parseExcelFile(
      new File([ab], "locale.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const sheet = parsed.sheets[0];
    const map = autoMapHeaders(sheet.headers);
    const tasks = sheetToTasks(sheet, map, "work");
    const t = Object.fromEntries(tasks.map((x) => [x.title, x]));
    ok(
      "locale-m/d/yy-not-someday",
      t["로케일날짜"]?.startDate === "2026-10-17" &&
        t["로케일날짜"]?.kind === "spot",
      t["로케일날짜"],
    );
    ok(
      "serial-number-not-someday",
      t["시리얼"]?.startDate === "2026-10-17",
      t["시리얼"],
    );
    ok(
      "korean-date",
      t["한글날짜"]?.startDate === "2026-10-18",
      t["한글날짜"],
    );
  }

  // ——— Similarity notice ———
  {
    const existing = [
      baseTask({
        id: "e1",
        title: "병원 진료 예약 확인",
        memo: "서류",
      }),
    ];
    const sheet: ParsedSheet = {
      name: "할 일",
      headers: ["할일 LIST UP", "마감목표", "중요도", "틀"],
      rows: [
        {
          "할일 LIST UP": "병원 진료 예약 점검",
          마감목표: "2026-10-20",
          중요도: 2,
          틀: "업무용",
        },
        {
          "할일 LIST UP": "전혀다른할일xyz",
          마감목표: "언젠가",
          중요도: 1,
          틀: "개인용",
        },
      ],
    };
    const map = autoMapHeaders(sheet.headers);
    const preview = buildPreviewRows(sheet, map, "work", existing);
    ok(
      "similar-hit-on-dupe",
      preview[0].similarHits.length >= 1,
      preview[0].similarHits.map((h) => h.task.title),
    );
    ok(
      "no-similar-on-unrelated",
      preview[1].similarHits.length === 0,
      preview[1].similarHits,
    );
    const summary = summarizeImportSimilarities(preview);
    ok("similar-summary", Boolean(summary && summary.count >= 1), summary);
    ok("preview-shows-틀", preview[0].categoryLabel === "업무용", preview[0]);
  }

  const report = {
    ok: true,
    sample: samplePath,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(OUT, "smoke-excel-import-renewal.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("all passed", report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
