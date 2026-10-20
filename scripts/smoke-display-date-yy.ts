/**
 * Father-facing date display: YYYY-MM-DD → YY-MM-DD
 * Storage / Excel export stay full ISO.
 */
import {
  deadlineExcelParts,
  formatDeadlineRange,
  formatDisplayDate,
  formatDisplayDateRange,
} from "../src/lib/date-range";
import { formatEventDeadline } from "../src/lib/sheet-rows";
import { datedExcelFilename } from "../src/lib/excel-filename";
import type { CalendarEvent, Task } from "../src/lib/types";

let failed = 0;
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`ok  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`, detail ?? "");
  }
}

ok("single", formatDisplayDate("2026-10-20") === "26-10-20");
ok(
  "range",
  formatDisplayDateRange("2026-10-10", "2026-10-11") ===
    "26-10-10 ~ 26-10-11",
);
ok("someday passthrough", formatDisplayDate("언젠가") === "언젠가");
ok("non-iso passthrough", formatDisplayDate("10/20") === "10/20");

const task: Pick<Task, "startDate" | "targetDate" | "kind"> = {
  startDate: "2026-10-10",
  targetDate: "2026-10-11",
  kind: "ongoing",
};
ok(
  "deadline display range",
  formatDeadlineRange(task) === "26-10-10 ~ 26-10-11",
);
ok(
  "deadline display single",
  formatDeadlineRange({
    startDate: "2026-10-20",
    targetDate: "2026-10-20",
    kind: "spot",
  }) === "26-10-20",
);
ok(
  "someday unchanged",
  formatDeadlineRange({
    startDate: null,
    targetDate: null,
    kind: "someday",
  }) === "언젠가",
);

const xl = deadlineExcelParts(task);
ok(
  "excel export keeps full ISO range text",
  xl.kind === "rangeText" && xl.value === "2026-10-10 ~ 2026-10-11",
  xl,
);

const singleXl = deadlineExcelParts({
  startDate: "2026-10-20",
  targetDate: "2026-10-20",
  kind: "spot",
});
ok(
  "excel single keeps full ISO start",
  singleXl.kind === "date" && singleXl.start === "2026-10-20",
  singleXl,
);

ok(
  "filename stays full year",
  datedExcelFilename(new Date("2026-10-20T12:00:00+09:00")) ===
    "일비서_2026-10-20.xlsx",
);

const ev: CalendarEvent = {
  id: "e1",
  title: "출장",
  start: "2026-10-14",
  end: "2026-10-22",
  allDay: true,
  notes: "",
  source: "mock",
};
ok(
  "gcal frame deadline YY",
  formatEventDeadline(ev) === "26-10-14 ~ 26-10-21",
  formatEventDeadline(ev),
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall ok");
