/**
 * Pure lib checks: similarity · briefing KST/range · Excel gcal sheet
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { findSimilarActiveTasks } from "../src/lib/text-similarity";
import { buildDailyBriefing } from "../src/lib/briefing";
import { buildWorkbook } from "../src/lib/excel";
import { formatCalendarWhen } from "../src/lib/calendar-data";
import {
  todayIsoKst,
  addDaysIso,
  cheerDayIsoKst,
} from "../src/lib/date-range";
import type { Task, CalendarEvent } from "../src/lib/types";

const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const today = todayIsoKst();
  const results: {
    today: string;
    checks: { name: string; ok: boolean; detail: unknown }[];
  } = { today, checks: [] };

  function ok(name: string, cond: boolean, detail: unknown = null) {
    results.checks.push({ name, ok: Boolean(cond), detail });
    if (!cond) throw new Error(`${name}: ${JSON.stringify(detail)}`);
  }

  function baseTask(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
    return {
      category: "work",
      kind: "spot",
      startDate: today,
      targetDate: today,
      urgency: 2,
      importance: 2,
      groupKey: "g",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: new Date().toISOString(),
      completedAt: null,
      ...partial,
    };
  }

  // 1) Self title∩memo never alerts
  {
    const task = baseTask({
      id: "self",
      title: "출장 준비 서류",
      memo: "출장 준비 서류",
      kind: "ongoing",
      targetDate: addDaysIso(today, 5),
    });
    const hits = findSimilarActiveTasks(task, [task], task.id);
    ok("self-row-no-hit", hits.length === 0, hits);
  }

  // 2) Loose single shared token must NOT alert
  {
    const peer = baseTask({
      id: "p1",
      title: "주간 회의",
      memo: "안건 정리",
    });
    const hits = findSimilarActiveTasks(
      { title: "팀 회의", memo: "자료" },
      [peer],
      "c1",
    );
    ok("single-token-no-false-positive", hits.length === 0, hits);
  }

  // 3) Real near-duplicate still alerts
  {
    const peer = baseTask({
      id: "p2",
      title: "병원 진료 예약 확인",
      memo: "서류 준비",
    });
    const hits = findSimilarActiveTasks(
      { title: "병원 진료 예약 점검", memo: "" },
      [peer],
      "c2",
    );
    ok(
      "real-duplicate-alerts",
      hits.length === 1,
      hits.map((h) => h.task.title),
    );
  }

  // 4) Briefing date = KST (cron 23:00 UTC → next KST morning)
  {
    const cronUtc = new Date(Date.UTC(2026, 9, 12, 23, 0, 0));
    const b = buildDailyBriefing([], [], cronUtc, [], []);
    ok("briefing-kst-date", b.date === "2026-10-13", b.date);
    ok("briefing-headline-kst", b.headline.includes("10월 13일"), b.headline);
    ok(
      "briefing-has-html",
      typeof b.html === "string" && b.html.includes("【할 일】"),
      b.html.slice(0, 120),
    );
  }

  // 4b) Cheer day boundary at 07:00 KST
  {
    ok(
      "cheer-before-7-is-prev-day",
      cheerDayIsoKst(new Date("2026-10-14T06:59:59+09:00")) === "2026-10-13",
      cheerDayIsoKst(new Date("2026-10-14T06:59:59+09:00")),
    );
    ok(
      "cheer-at-7-is-new-day",
      cheerDayIsoKst(new Date("2026-10-14T07:00:00+09:00")) === "2026-10-14",
      cheerDayIsoKst(new Date("2026-10-14T07:00:00+09:00")),
    );
    ok(
      "cheer-evening-same-day",
      cheerDayIsoKst(new Date("2026-10-14T23:30:00+09:00")) === "2026-10-14",
      cheerDayIsoKst(new Date("2026-10-14T23:30:00+09:00")),
    );
  }

  // 5) Briefing = today-only overlap (not 7-day window)
  {
    const futureStart = "2026-10-16";
    const futureEnd = "2026-10-17";
    const futureTask = baseTask({
      id: "future-range",
      title: "미래 기간 할일",
      category: "personal",
      kind: "ongoing",
      startDate: futureStart,
      targetDate: futureEnd,
    });
    const todayRange = baseTask({
      id: "today-range",
      title: "오늘 포함 기간",
      category: "work",
      kind: "ongoing",
      startDate: addDaysIso(today, -1),
      targetDate: addDaysIso(today, 2),
    });
    const todaySingle = baseTask({
      id: "today-single",
      title: "오늘 하루",
      kind: "spot",
      startDate: today,
      targetDate: today,
    });
    // Freeze “today” as 2026-10-14 for the reported bug case
    const briefDay = new Date("2026-10-14T08:00:00+09:00");
    const bBug = buildDailyBriefing(
      [
        baseTask({
          id: "bug",
          title: "미래 기간 버그케이스",
          kind: "ongoing",
          startDate: "2026-10-16",
          targetDate: "2026-10-17",
        }),
        baseTask({
          id: "ok-range",
          title: "오늘겹침",
          kind: "ongoing",
          startDate: "2026-10-14",
          targetDate: "2026-10-17",
        }),
      ],
      [],
      briefDay,
      [],
      [],
    );
    const bugTitles = bBug.sections.flatMap((s) => s.lines.map((l) => l.title));
    ok(
      "future-range-excluded-on-1014",
      !bugTitles.includes("미래 기간 버그케이스"),
      bugTitles,
    );
    ok("today-overlap-included-on-1014", bugTitles.includes("오늘겹침"), bugTitles);

    const b = buildDailyBriefing(
      [futureTask, todayRange, todaySingle],
      [],
      new Date(),
      [],
      [],
    );
    const titles = b.sections.flatMap((s) => s.lines.map((l) => l.title));
    ok("future-range-not-in-briefing", !titles.includes("미래 기간 할일"), {
      titles,
      futureStart,
      futureEnd,
    });
    ok("today-range-in-briefing", titles.includes("오늘 포함 기간"), titles);
    ok("today-single-in-briefing", titles.includes("오늘 하루"), titles);
    const line = b.sections
      .flatMap((s) => s.lines)
      .find((l) => l.title === "오늘 포함 기간");
    ok(
      "range-deadline-label",
      Boolean(line?.deadlineLabel.includes("~")),
      line?.deadlineLabel,
    );
  }

  // 6) formatCalendarWhen multi-day
  {
    const ev: CalendarEvent = {
      id: "e1",
      title: "출장",
      start: "2026-10-14",
      end: "2026-10-22",
      allDay: true,
      notes: "",
      source: "mock",
    };
    const when = formatCalendarWhen(ev);
    ok("calendar-when-range", when === "2026-10-14 ~ 2026-10-21", when);
  }

  // 7) Excel 구글캘린더 sheet rules
  {
    const saveDay = today;
    const events: CalendarEvent[] = [
      {
        id: "near",
        title: "가까운회의",
        start: `${addDaysIso(saveDay, 1)}T10:00:00`,
        end: `${addDaysIso(saveDay, 1)}T11:00:00`,
        allDay: false,
        notes: "",
        source: "google",
        calendarName: "Work",
      },
      {
        id: "span",
        title: "긴출장",
        start: addDaysIso(saveDay, 3),
        end: addDaysIso(saveDay, 8),
        allDay: true,
        notes: "range",
        source: "google",
        calendarName: "Work",
      },
      {
        id: "far",
        title: "먼일정",
        start: addDaysIso(saveDay, 20),
        end: addDaysIso(saveDay, 21),
        allDay: true,
        notes: "",
        source: "google",
        calendarName: "Work",
      },
    ];
    const buf = await buildWorkbook({
      tasks: [],
      calendarEvents: events,
      briefing: buildDailyBriefing([], events, new Date(), [], []),
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    const sheet = wb.getWorksheet("구글캘린더");
    ok("excel-cal-sheet", Boolean(sheet), null);
    const headers: string[] = [];
    sheet!.getRow(1).eachCell((c) => headers.push(String(c.value)));
    ok("excel-no-calendar-col", !headers.includes("캘린더"), headers.join(","));
    ok("excel-no-source-col", !headers.includes("출처"), headers.join(","));
    ok(
      "excel-has-when-title-memo",
      headers.includes("언제") &&
        headers.includes("일정") &&
        headers.includes("메모"),
      headers.join(","),
    );
    const rows: { when: string; title: string }[] = [];
    sheet!.eachRow((row, n) => {
      if (n === 1) return;
      rows.push({
        when: String(row.getCell(1).value ?? ""),
        title: String(row.getCell(2).value ?? ""),
      });
    });
    ok("excel-excludes-far", !rows.some((r) => r.title === "먼일정"), rows);
    ok(
      "excel-includes-near",
      rows.some((r) => r.title === "가까운회의"),
      rows,
    );
    const span = rows.find((r) => r.title === "긴출장");
    ok("excel-multiday-one-row", Boolean(span?.when.includes("~")), span);
    fs.writeFileSync(
      path.join(OUT, "ilbiseo-excel-gcal-2week-sample.xlsx"),
      Buffer.from(buf as ArrayBuffer),
    );
  }

  fs.writeFileSync(
    path.join(OUT, "smoke-alert-briefing-excel-lib.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
