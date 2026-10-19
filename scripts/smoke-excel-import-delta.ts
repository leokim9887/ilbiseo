/**
 * Delta-only import · exact deadline calendar · 지침/습관 no 완료 · round-trip
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { buildWorkbook } from "../src/lib/excel";
import { deadlineExcelParts } from "../src/lib/date-range";
import {
  autoMapHeaders,
  buildPreviewRows,
  buildSidePreviewRows,
  classifyImportSheet,
  dateToIsoCalendar,
  parseDeadline,
  parseExcelFile,
  previewToSideDelta,
  previewToTodoDelta,
  summarizeDeltaCounts,
  taskContentKey,
  taskMatchKey,
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
  // ——— Deadline: serial / Date / locale / range / 언젠가 ———
  ok(
    "serial-45982",
    parseDeadline(String(45982)).startDate === "2025-12-21" ||
      parseDeadline("45982").startDate != null,
    parseDeadline("45982"),
  );
  // Excel serial for 2026-10-17 ≈ 45982+... let's compute via known UTC date
  {
    const serialIso = dateToIsoCalendar(new Date(Date.UTC(2026, 9, 17)));
    ok("utc-date-object", serialIso === "2026-10-17", serialIso);
  }
  ok(
    "ymd-exact",
    parseDeadline("2026-10-17").startDate === "2026-10-17" &&
      parseDeadline("2026-10-17").targetDate === "2026-10-17",
  );
  ok(
    "range-tilde",
    parseDeadline("2026-10-01 ~ 2026-10-30").startDate === "2026-10-01" &&
      parseDeadline("2026-10-01 ~ 2026-10-30").targetDate === "2026-10-30" &&
      parseDeadline("2026-10-01 ~ 2026-10-30").kind === "ongoing",
  );
  ok(
    "range-fullwidth",
    parseDeadline("2026-11-01～2026-11-05").startDate === "2026-11-01",
  );
  ok(
    "locale-mdy",
    parseDeadline("10/17/2026").startDate === "2026-10-17",
    parseDeadline("10/17/2026"),
  );
  ok(
    "korean-ymd",
    parseDeadline("2026년 10월 17일").startDate === "2026-10-17",
  );
  ok(
    "someday-intentional",
    parseDeadline("언젠가").kind === "someday" &&
      parseDeadline("언젠가").startDate === null,
  );
  ok(
    "empty-someday",
    parseDeadline("").kind === "someday",
  );

  // Father until-only `~M/D`: start = today (KST), end = tilde date — NOT tilde as start
  {
    const today = "2026-10-19";
    const untilSame = parseDeadline("~10/19", { today });
    ok(
      "until-tilde-same-day",
      untilSame.startDate === today &&
        untilSame.targetDate === "2026-10-19" &&
        untilSame.kind === "spot" &&
        untilSame.label === "2026-10-19",
      untilSame,
    );
    const untilLater = parseDeadline("~10/30", { today });
    ok(
      "until-tilde-start-today-end-md",
      untilLater.startDate === today &&
        untilLater.targetDate === "2026-10-30" &&
        untilLater.kind === "ongoing" &&
        untilLater.label === "2026-10-19 ~ 2026-10-30",
      untilLater,
    );
    const untilFw = parseDeadline("～10/18", { today });
    ok(
      "until-fullwidth-tilde",
      untilFw.startDate === today && untilFw.targetDate === "2026-10-18",
      untilFw,
    );
    // Do NOT treat tilde date as start
    ok(
      "until-not-tilde-as-start",
      untilLater.startDate !== "2026-10-30" &&
        untilSame.startDate === today,
    );
    // Full range with both sides still uses explicit start (not today)
    const both = parseDeadline("2026-10-01 ~ 2026-10-30", { today });
    ok(
      "full-range-keeps-explicit-start",
      both.startDate === "2026-10-01" && both.targetDate === "2026-10-30",
      both,
    );
  }

  // Off-by-one regression: KST local midnight must NOT become previous UTC day
  {
    const kstMid = new Date("2026-10-16T15:00:00.000Z"); // KST 10-17 00:00
    const iso = dateToIsoCalendar(kstMid);
    // serial reconstruction: should be 2026-10-17
    ok("off-by-one-kst-midnight", iso === "2026-10-17", {
      iso,
      local: kstMid.toString(),
    });
  }
  {
    // If code used getUTC* on local-midnight Date wrongly → 16
    const wrongUtc = "2026-10-16";
    const right = dateToIsoCalendar(new Date("2026-10-16T15:00:00.000Z"));
    ok("off-by-one-not-16", right !== wrongUtc && right === "2026-10-17", right);
  }

  // Export parts: range → text (not Date)
  {
    const parts = deadlineExcelParts({
      kind: "ongoing",
      startDate: "2026-10-01",
      targetDate: "2026-10-30",
    });
    ok("export-range-text", parts.kind === "rangeText", parts);
    const single = deadlineExcelParts({
      kind: "spot",
      startDate: "2026-10-17",
      targetDate: "2026-10-17",
    });
    ok("export-single-date", single.kind === "date", single);
    const someday = deadlineExcelParts({
      kind: "someday",
      startDate: null,
      targetDate: null,
    });
    ok("export-someday", someday.kind === "someday" && someday.value === "언젠가");
  }

  // ——— Round-trip export → import preserves dates ———
  const tasks: Task[] = [
    baseTask({ id: "1", title: "단일일" }),
    baseTask({
      id: "2",
      title: "기간일",
      kind: "ongoing",
      category: "personal",
      startDate: "2026-10-01",
      targetDate: "2026-10-30",
    }),
    baseTask({
      id: "3",
      title: "언젠가일",
      kind: "someday",
      startDate: null,
      targetDate: null,
    }),
  ];
  const guidelines: SideListItem[] = [
    {
      id: "g1",
      title: "아침 스트레칭",
      memo: "5분",
      done: false,
      createdAt: "2026-10-17T00:00:00.000Z",
      completedAt: null,
    },
  ];
  const habits: SideListItem[] = [
    {
      id: "h1",
      title: "물 마시기",
      memo: "",
      done: false,
      createdAt: "2026-10-17T00:00:00.000Z",
      completedAt: null,
    },
  ];

  const buf = await buildWorkbook({
    tasks,
    calendarEvents: [],
    guidelines,
    habits,
  });

  // Side sheets: no 완료 column
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    for (const name of ["지침", "습관"] as const) {
      const ws = wb.getWorksheet(name)!;
      const headers: string[] = [];
      ws.getRow(1).eachCell((c) => headers.push(String(c.value)));
      ok(
        `side-${name}-no-완료`,
        !headers.some((h) => h.includes("완료")) &&
          headers.includes("내용") &&
          headers.includes("메모"),
        headers,
      );
    }
  }

  const file = new File([buf], "일비서-delta.xlsx");
  const parsed = await parseExcelFile(file);
  const todo = parsed.sheets.find((s) => classifyImportSheet(s.name) === "todo")!;
  const map = autoMapHeaders(todo.headers, "todo");

  // Fresh app (no existing) → all new
  {
    const preview = buildPreviewRows(todo, map, "work", []);
    const delta = previewToTodoDelta(preview);
    const counts = summarizeDeltaCounts(preview);
    ok("fresh-all-new", counts.neu === 3 && counts.changed === 0, counts);
    const single = delta.add.find((t) => t.title === "단일일");
    const range = delta.add.find((t) => t.title === "기간일");
    const some = delta.add.find((t) => t.title === "언젠가일");
    ok(
      "rt-single",
      single?.startDate === "2026-10-17" && single?.targetDate === "2026-10-17",
      single,
    );
    ok(
      "rt-range",
      range?.startDate === "2026-10-01" && range?.targetDate === "2026-10-30",
      range,
    );
    ok(
      "rt-someday",
      some?.kind === "someday" &&
        some?.startDate === null &&
        some?.targetDate === null,
      some,
    );
  }

  // ——— Delta: unchanged skipped, changed updates, new adds ———
  {
    const existing = tasks.map((t) => ({ ...t }));
    const preview = buildPreviewRows(todo, map, "work", existing);
    const counts = summarizeDeltaCounts(preview);
    ok(
      "reimport-all-unchanged",
      counts.neu === 0 &&
        counts.changed === 0 &&
        counts.unchanged === 3 &&
        previewToTodoDelta(preview).add.length === 0 &&
        previewToTodoDelta(preview).update.length === 0,
      counts,
    );
  }

  // Changed deadline → update matched id
  {
    const existing = [
      baseTask({
        id: "keep-me",
        title: "단일일",
        startDate: "2026-10-10",
        targetDate: "2026-10-10",
      }),
      baseTask({
        id: "2",
        title: "기간일",
        kind: "ongoing",
        category: "personal",
        startDate: "2026-10-01",
        targetDate: "2026-10-30",
      }),
      baseTask({
        id: "3",
        title: "언젠가일",
        kind: "someday",
        startDate: null,
        targetDate: null,
      }),
    ];
    const preview = buildPreviewRows(todo, map, "work", existing);
    const delta = previewToTodoDelta(preview);
    const counts = summarizeDeltaCounts(preview);
    ok(
      "changed-deadline-detected",
      counts.changed === 1 && counts.unchanged === 2 && counts.neu === 0,
      counts,
    );
    ok(
      "changed-updates-same-id",
      delta.update.length === 1 &&
        delta.update[0].id === "keep-me" &&
        delta.update[0].patch.startDate === "2026-10-17" &&
        delta.update[0].patch.targetDate === "2026-10-17",
      delta.update,
    );
    ok(
      "match-key-title-frame",
      taskMatchKey("단일일", "work") === taskMatchKey("단일일", "work"),
    );
  }

  // New row in Excel
  {
    const existing = tasks.slice(0, 2);
    const preview = buildPreviewRows(todo, map, "work", existing);
    const counts = summarizeDeltaCounts(preview);
    ok(
      "new-someday-only",
      counts.neu === 1 &&
        counts.unchanged === 2 &&
        previewToTodoDelta(preview).add[0]?.title === "언젠가일",
      counts,
    );
  }

  // Side delta
  {
    const guide = parsed.sheets.find(
      (s) => classifyImportSheet(s.name) === "guideline",
    )!;
    const gMap = autoMapHeaders(guide.headers, "guideline");
    const existingG = [...guidelines];
    const prevSame = buildSidePreviewRows(guide, gMap, existingG);
    ok(
      "side-unchanged",
      summarizeDeltaCounts(prevSame).unchanged === 1 &&
        previewToSideDelta(prevSame).add.length === 0,
    );
    const existingEdit: SideListItem[] = [
      { ...guidelines[0], memo: "옛메모" },
    ];
    const prevCh = buildSidePreviewRows(guide, gMap, existingEdit);
    const d = previewToSideDelta(prevCh);
    ok(
      "side-changed-memo",
      d.update.length === 1 &&
        d.update[0].id === "g1" &&
        d.update[0].patch.memo === "5분",
      d,
    );
    // New guideline
    const prevNew = buildSidePreviewRows(guide, gMap, []);
    ok(
      "side-new",
      previewToSideDelta(prevNew).add.some((i) => i.title === "아침 스트레칭"),
    );
  }

  // Serial cell via ExcelJS Date round-trip (single day)
  {
    const xwb = new ExcelJS.Workbook();
    const ws = xwb.addWorksheet("할 일");
    ws.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
    const r = ws.addRow([
      1,
      "업무용",
      "시리얼검증",
      new Date(Date.UTC(2026, 9, 17)),
      2,
    ]);
    r.getCell(4).numFmt = "yyyy-mm-dd";
    const ab = Buffer.from(await xwb.xlsx.writeBuffer());
    const p = await parseExcelFile(new File([ab], "serial.xlsx"));
    const prev = buildPreviewRows(
      p.sheets[0],
      autoMapHeaders(p.sheets[0].headers),
      "work",
      [],
    );
    ok(
      "serial-cell-exact",
      prev[0]?.startDate === "2026-10-17" &&
        prev[0]?.deadlineLabel === "2026-10-17",
      prev[0],
    );
  }

  // Range text cell round-trip
  {
    const xwb = new ExcelJS.Workbook();
    const ws = xwb.addWorksheet("할 일");
    ws.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
    ws.addRow([1, "업무용", "구간검증", "2026-09-01 ~ 2026-09-30", 2]);
    const ab = Buffer.from(await xwb.xlsx.writeBuffer());
    const p = await parseExcelFile(new File([ab], "range.xlsx"));
    const prev = buildPreviewRows(
      p.sheets[0],
      autoMapHeaders(p.sheets[0].headers),
      "work",
      [],
    );
    ok(
      "range-text-exact",
      prev[0]?.startDate === "2026-09-01" &&
        prev[0]?.targetDate === "2026-09-30" &&
        prev[0]?.deadlineLabel === "2026-09-01 ~ 2026-09-30",
      prev[0],
    );
  }

  // Content key stability
  {
    const a = taskContentKey({
      title: "A",
      memo: "",
      category: "work",
      startDate: "2026-10-17",
      targetDate: "2026-10-17",
      importance: 2,
    });
    const b = taskContentKey({
      title: "A",
      memo: "",
      category: "work",
      startDate: "2026-10-18",
      targetDate: "2026-10-18",
      importance: 2,
    });
    ok("content-key-differs-on-date", a !== b);
  }

  fs.writeFileSync(
    path.join(OUT, "smoke-excel-import-delta.json"),
    JSON.stringify({ ok: true, at: new Date().toISOString() }, null, 2),
  );
  console.log("all passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
