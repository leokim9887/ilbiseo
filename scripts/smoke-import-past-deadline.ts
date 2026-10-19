/**
 * After Excel import: 마감목표 start < today(KST) → 「지난 일정」 (isPastUnfinishedTask).
 * start === today / future / 언젠가 → not past.
 * Range A~B with A past + B future → still past (start rule).
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import {
  parseDeadline,
  parseExcelFile,
  autoMapHeaders,
  sheetToTasks,
} from "../src/lib/excel-import";
import { isPastUnfinishedTask, todayIsoKst } from "../src/lib/date-range";
import { sinkPastSheetRowsLast } from "../src/lib/sheet-rows";
import { sinkPastUnfinishedTasksLast as sinkSort } from "../src/lib/sort";
import type { Task } from "../src/lib/types";

const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

const results: { name: string; ok: boolean; detail?: unknown }[] = [];
function ok(name: string, cond: boolean, detail?: unknown) {
  results.push({ name, ok: cond, detail: cond ? undefined : detail });
  console.log(cond ? "ok" : "FAIL", name, cond ? "" : detail);
}

async function main() {
  const today = "2026-10-19";

  // ——— Unit: start-based past ———
  ok(
    "single past day → past",
    isPastUnfinishedTask(
      {
        status: "active",
        kind: "spot",
        startDate: "2026-10-18",
        targetDate: "2026-10-18",
      },
      today,
    ),
  );
  ok(
    "single today → not past",
    !isPastUnfinishedTask(
      {
        status: "active",
        kind: "spot",
        startDate: today,
        targetDate: today,
      },
      today,
    ),
  );
  ok(
    "range start past end future → past (start rule)",
    isPastUnfinishedTask(
      {
        status: "active",
        kind: "ongoing",
        startDate: "2026-10-01",
        targetDate: "2026-11-30",
      },
      today,
    ),
  );
  ok(
    "range start today end future → not past",
    !isPastUnfinishedTask(
      {
        status: "active",
        kind: "ongoing",
        startDate: today,
        targetDate: "2026-10-30",
      },
      today,
    ),
  );
  ok(
    "언젠가 → not past",
    !isPastUnfinishedTask(
      {
        status: "active",
        kind: "someday",
        startDate: null,
        targetDate: null,
      },
      today,
    ),
  );

  // Tilde ~10/18 with today 10/19 → single day 10/18 → past (지난 일정)
  {
    const d = parseDeadline("~10/18", { today });
    ok(
      "tilde ~10/18 past → single day → past section",
      d.startDate === "2026-10-18" &&
        d.targetDate === "2026-10-18" &&
        d.label === "2026-10-18" &&
        isPastUnfinishedTask(
          {
            status: "active",
            kind: d.kind,
            startDate: d.startDate,
            targetDate: d.targetDate,
          },
          today,
        ),
      d,
    );
  }

  // Explicit old start from father Excel paste
  {
    const d = parseDeadline("2026-10-01 ~ 2026-10-30", { today });
    ok(
      "explicit old start → past after import shape",
      d.startDate === "2026-10-01" &&
        isPastUnfinishedTask(
          {
            status: "active",
            kind: d.kind,
            startDate: d.startDate,
            targetDate: d.targetDate,
          },
          today,
        ),
      d,
    );
  }

  // ——— Import fixture → sheetToTasks → sink ———
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("할 일");
  ws.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
  ws.addRow([1, "업무용", "오늘일", today, 2]);
  ws.addRow([2, "업무용", "예전시작구간", "2026-10-01 ~ 2026-11-30", 3]);
  ws.addRow([3, "업무용", "어제하루", "2026-10-18", 2]);
  ws.addRow([4, "업무용", "틸드오늘시작", "~10/30", 2]);
  ws.addRow([5, "업무용", "언젠가일", "언젠가", 1]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const fixture = path.join(OUT, "ilbiseo-import-past-deadline-fixture.xlsx");
  fs.writeFileSync(fixture, buf);

  const file = new File([buf], "일비서.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const parsed = await parseExcelFile(file);
  const todo = parsed.sheets.find((s) => s.name === "할 일")!;
  const mapping = autoMapHeaders(todo.headers);
  const tasks = sheetToTasks(todo, mapping, "work") as Task[];

  // sheetToTasks uses live today for tilde — for past checks use live today on live tasks,
  // and re-parse explicit cells with fixed today for deterministic asserts.
  const live = todayIsoKst();
  const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t]));

  ok(
    "imported 어제하루 start < live today → past",
    byTitle["어제하루"] &&
      isPastUnfinishedTask(byTitle["어제하루"], live),
    byTitle["어제하루"],
  );
  ok(
    "imported 예전시작구간 start past → past",
    byTitle["예전시작구간"] &&
      isPastUnfinishedTask(byTitle["예전시작구간"], live),
    byTitle["예전시작구간"],
  );
  ok(
    "imported 오늘일 → not past",
    byTitle["오늘일"] && !isPastUnfinishedTask(byTitle["오늘일"], live),
    byTitle["오늘일"],
  );
  ok(
    "imported 언젠가일 → not past",
    byTitle["언젠가일"] && !isPastUnfinishedTask(byTitle["언젠가일"], live),
    byTitle["언젠가일"],
  );
  ok(
    "imported 틸드오늘시작 start=live today → not past",
    byTitle["틸드오늘시작"]?.startDate === live &&
      !isPastUnfinishedTask(byTitle["틸드오늘시작"], live),
    byTitle["틸드오늘시작"],
  );

  // Sink order: current first, separator, past last
  const rows = tasks.map((t) => ({
    kind: "task" as const,
    id: t.id,
    task: t,
    sortKey: t.title,
  }));
  const sunk = sinkPastSheetRowsLast(rows, live);
  const kinds = sunk.map((r) =>
    r.kind === "past-separator"
      ? "SEP"
      : isPastUnfinishedTask(r.task, live)
        ? `past:${r.task.title}`
        : `cur:${r.task.title}`,
  );
  const sepAt = kinds.indexOf("SEP");
  ok(
    "sink inserts separator between current and past",
    sepAt > 0 && sepAt < kinds.length - 1,
    kinds,
  );
  ok(
    "과거 행은 separator 아래",
    kinds.slice(sepAt + 1).every((k) => k.startsWith("past:")),
    kinds,
  );
  ok(
    "오늘/언젠가/틸드는 separator 위",
    kinds.slice(0, sepAt).every((k) => k.startsWith("cur:")),
    kinds,
  );

  // sort.ts sink uses same predicate
  const sorted = sinkSort(tasks, live);
  const firstPast = sorted.findIndex((t) => isPastUnfinishedTask(t, live));
  const lastCurrent = sorted
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !isPastUnfinishedTask(t, live))
    .pop()?.i;
  ok(
    "sort sink: all current before any past",
    firstPast === -1 ||
      (lastCurrent !== undefined && lastCurrent < firstPast),
    sorted.map((t) => t.title),
  );

  const summary = {
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    fixture,
    liveToday: live,
  };
  fs.writeFileSync(
    path.join(OUT, "smoke-import-past-deadline.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
