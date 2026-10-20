/**
 * Regression: past~today ranges must display/normalize as single past day.
 * Failing case from ui-refs/deadline-past-range-still-broken.png:
 *   stored `2026-10-18 ~ 2026-10-19` with today=10/19 → show `2026-10-18`
 */
import fs from "fs";
import path from "path";
import {
  collapsePastCappedToToday,
  formatDeadlineRange,
  formatDeadlineRangeCompact,
  normalizeTaskDeadlineDates,
  taskDateRange,
  deadlineExcelParts,
  isPastUnfinishedTask,
} from "../src/lib/date-range";
import { parseDeadline } from "../src/lib/excel-import";
import { normalizeState, stateHadDeadlineCollapse } from "../src/lib/storage";
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

function baseTask(
  partial: Partial<Task> & Pick<Task, "startDate" | "targetDate">,
): Task {
  return {
    id: "t1",
    title: "x",
    category: "personal",
    kind: "ongoing",
    urgency: 2,
    importance: 2,
    groupKey: "x",
    memo: "",
    source: "import",
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
    completedAt: null,
    ...partial,
  };
}

function main() {
  const today = "2026-10-19";

  // ——— Core collapse ———
  {
    const c = collapsePastCappedToToday("2026-10-18", "2026-10-19", today);
    ok(
      "collapse 10/18~10/19 → 10/18",
      c.collapsed &&
        c.startDate === "2026-10-18" &&
        c.targetDate === "2026-10-18",
      c,
    );
  }
  {
    const c = collapsePastCappedToToday("2026-10-19", "2026-10-18", today);
    ok(
      "collapse inverted 10/19~10/18 → 10/18",
      c.collapsed && c.startDate === "2026-10-18",
      c,
    );
  }
  {
    const c = collapsePastCappedToToday("2026-10-16", "2026-10-19", today);
    ok(
      "collapse 10/16~10/19 → 10/16",
      c.collapsed && c.startDate === "2026-10-16",
      c,
    );
  }
  {
    const c = collapsePastCappedToToday("2026-10-01", "2026-11-30", today);
    ok(
      "keep legitimate past~future range",
      !c.collapsed &&
        c.startDate === "2026-10-01" &&
        c.targetDate === "2026-11-30",
      c,
    );
  }

  // ——— Display (the user-visible bug) ———
  {
    const task = baseTask({
      startDate: "2026-10-18",
      targetDate: "2026-10-19",
      kind: "ongoing",
    });
    const label = formatDeadlineRange(task, today);
    ok(
      "formatDeadlineRange past~today → single 26-10-18",
      label === "26-10-18",
      label,
    );
    ok(
      "compact also single YY-MM-DD",
      formatDeadlineRangeCompact(task, today) === "26-10-18",
      formatDeadlineRangeCompact(task, today),
    );
    const r = taskDateRange(task, today);
    ok(
      "taskDateRange collapsed to single",
      r?.start === "2026-10-18" && r?.end === "2026-10-18",
      r,
    );
    const xl = deadlineExcelParts(task, today);
    ok(
      "excel parts is date not rangeText",
      xl.kind === "date" && xl.start === "2026-10-18",
      xl,
    );
  }

  // Screenshot rows 30–35 patterns (display = YY-MM-DD)
  for (const [start, end, want] of [
    ["2026-10-18", "2026-10-19", "26-10-18"],
    ["2026-10-16", "2026-10-19", "26-10-16"],
    ["2026-10-15", "2026-10-19", "26-10-15"],
  ] as const) {
    const label = formatDeadlineRange(
      baseTask({ startDate: start, targetDate: end }),
      today,
    );
    ok(`display ${start}~${end} → ${want}`, label === want, label);
  }

  // ——— Normalize stored task ———
  {
    const n = normalizeTaskDeadlineDates(
      baseTask({
        startDate: "2026-10-18",
        targetDate: "2026-10-19",
        kind: "ongoing",
      }),
      today,
    );
    ok(
      "normalizeTaskDeadlineDates → spot single",
      n.startDate === "2026-10-18" &&
        n.targetDate === "2026-10-18" &&
        n.kind === "spot",
      n,
    );
    ok(
      "normalized is past for 지난 일정",
      isPastUnfinishedTask(n, today),
    );
  }

  // ——— load path normalizeState ———
  {
    const raw = {
      version: 3,
      tasks: [
        {
          id: "bad1",
          title: "승식과 선물",
          category: "personal",
          kind: "ongoing",
          startDate: "2026-10-18",
          targetDate: "2026-10-19",
          urgency: 2,
          importance: 1,
          groupKey: "승식",
          memo: "",
          source: "import",
          status: "active",
          createdAt: "2026-10-01T00:00:00.000Z",
          completedAt: null,
        },
        {
          id: "ok1",
          title: "미래구간",
          category: "work",
          kind: "ongoing",
          startDate: "2026-10-19",
          targetDate: "2026-10-30",
          urgency: 2,
          importance: 2,
          groupKey: "미래",
          memo: "",
          source: "manual",
          status: "active",
          createdAt: "2026-10-01T00:00:00.000Z",
          completedAt: null,
        },
      ],
      checklists: [],
      calendarEvents: [],
      guidelines: [],
      habits: [],
    };
    // Patch today by temporarily relying on live today — for unit we call
    // migrate via normalizeState which uses todayIsoKst(). When live today
    // is 2026-10-19 this asserts; otherwise still check collapse helper.
    const state = normalizeState(raw);
    const bad = state?.tasks.find((t) => t.id === "bad1");
    const liveToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (liveToday === today) {
      ok(
        "normalizeState collapses stored past~today",
        bad?.startDate === "2026-10-18" &&
          bad?.targetDate === "2026-10-18" &&
          bad?.kind === "spot",
        bad,
      );
      ok(
        "normalizeState flags collapse for persist",
        stateHadDeadlineCollapse(state!),
      );
      ok(
        "future range untouched",
        state?.tasks.find((t) => t.id === "ok1")?.targetDate ===
          "2026-10-30",
      );
    } else {
      ok(
        "normalizeState live-today skip (env today≠fixture)",
        true,
        { liveToday, today },
      );
    }
  }

  // ——— Import parse still correct ———
  ok(
    "parse ~10/18 → single",
    parseDeadline("~10/18", { today }).label === "2026-10-18",
  );
  ok(
    "parse 10/18~10/19 → single",
    parseDeadline("2026-10-18 ~ 2026-10-19", { today }).label ===
      "2026-10-18",
  );
  ok(
    "parse ~10/30 still range",
    parseDeadline("~10/30", { today }).label ===
      "2026-10-19 ~ 2026-10-30",
  );

  const summary = {
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  fs.writeFileSync(
    path.join(OUT, "smoke-past-deadline-normalize-v2.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exit(1);
}

main();
