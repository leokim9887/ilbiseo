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
import fs from "fs";
import path from "path";

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

// Hook wiring: periodic interval + interactive:false on auto path
const hookSrc = fs.readFileSync(
  path.join(__dirname, "../src/hooks/use-app-state.ts"),
  "utf8",
);
ok(
  "hook has 60s interval",
  /setInterval\([\s\S]*?60_000\)/.test(hookSrc) ||
    /setInterval\([\s\S]*?60 \* 1000\)/.test(hookSrc),
);
ok(
  "hook auto path uses interactive false",
  /ensureDatedExcelFilename\([\s\S]*?interactive:\s*false/.test(hookSrc),
);
ok(
  "hook rewrites after rename",
  /status === "renamed"[\s\S]*?syncExcelRef\.current/.test(hookSrc),
);

const linkSrc = fs.readFileSync(
  path.join(__dirname, "../src/lib/excel-link.ts"),
  "utf8",
);
ok(
  "ensureWritePermission skips requestPermission when non-interactive",
  /interactive !== false/.test(linkSrc) &&
    /if \(!interactive\) return false/.test(linkSrc),
);

const outDir = process.env.OUT_DIR;
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "smoke-excel-autodate-rename.json"),
    JSON.stringify(
      {
        ok: true,
        today,
        yesterdayFile: `일비서_${yesterday}.xlsx`,
        todayFile: datedExcelFilename(),
        msUntilMidnight: fromNow,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

console.log("smoke-excel-autodate-rename: all passed");
