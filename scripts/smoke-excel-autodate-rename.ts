/**
 * Smoke: KST midnight scheduling + dated rename policy (no browser FS).
 * Run: npx tsx scripts/smoke-excel-autodate-rename.ts
 */
import {
  datedExcelFilename,
  msUntilNextKstMidnight,
} from "../src/lib/excel-filename";
import { needsDatedExcelRename } from "../src/lib/excel-save-policy";
import { addDaysIso, todayIsoKst } from "../src/lib/date-range";

function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exit(1);
  }
  console.log("ok", name, detail ?? "");
}

const noonKst = new Date("2026-10-19T12:00:00+09:00");
ok(
  "filename at noon KST",
  datedExcelFilename(noonKst) === "일비서_2026-10-19.xlsx",
);

const justBeforeMidnight = new Date("2026-10-19T23:59:00+09:00");
const ms = msUntilNextKstMidnight(justBeforeMidnight);
ok("ms until midnight > 0", ms > 0 && ms < 120_000, ms);

const afterMidnight = new Date("2026-10-20T00:01:00+09:00");
ok(
  "filename after KST midnight",
  datedExcelFilename(afterMidnight) === "일비서_2026-10-20.xlsx",
);

const today = todayIsoKst();
const yesterday = addDaysIso(today, -1);
ok(
  "needs rename yesterday → today",
  needsDatedExcelRename(
    `일비서_${yesterday}.xlsx`,
    datedExcelFilename(),
  ) === true,
);
ok(
  "no rename same day",
  needsDatedExcelRename(datedExcelFilename(), datedExcelFilename()) === false,
);
ok(
  "needs rename legacy undated",
  needsDatedExcelRename("일비서.xlsx", datedExcelFilename()) === true,
);

// Next midnight should be within ~25h
const fromNow = msUntilNextKstMidnight();
ok("next midnight within 25h", fromNow > 0 && fromNow <= 25 * 60 * 60 * 1000, fromNow);

console.log("smoke-excel-autodate-rename: all passed");
