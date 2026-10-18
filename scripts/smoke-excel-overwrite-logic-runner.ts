import fs from "node:fs";
import path from "node:path";
import {
  classifyExcelWriteError,
  excelSaveToastMessage,
  needsDatedExcelRename,
  resolveSaveStrategy,
} from "../src/lib/excel-save-policy";
import { datedExcelFilename } from "../src/lib/excel-filename";
import { todayIsoKst } from "../src/lib/date-range";

const results: { name: string; pass: boolean; detail: unknown }[] = [];

function ok(name: string, pass: boolean, detail?: unknown) {
  results.push({ name, pass, detail: detail ?? null });
  console.log(pass ? `OK  ${name}` : `FAIL ${name}`, detail ?? "");
  if (!pass) {
    console.error("SMOKE FAILED", results);
    process.exit(1);
  }
}

ok(
  "strategy-first-save",
  resolveSaveStrategy({ forceNewFile: false, hasStoredHandle: false }) ===
    "picker",
);
ok(
  "strategy-later-overwrite",
  resolveSaveStrategy({ forceNewFile: false, hasStoredHandle: true }) ===
    "overwrite",
);
ok(
  "strategy-save-as",
  resolveSaveStrategy({ forceNewFile: true, hasStoredHandle: true }) ===
    "picker",
);
ok(
  "strategy-locked-no-picker",
  resolveSaveStrategy({
    forceNewFile: false,
    hasStoredHandle: true,
    overwriteError: "locked",
  }) === "error",
);
ok(
  "strategy-permission-no-picker",
  resolveSaveStrategy({
    forceNewFile: false,
    hasStoredHandle: true,
    overwriteError: "permission",
  }) === "error",
);

const locked = classifyExcelWriteError(
  Object.assign(new Error("The file is being used by another process"), {
    name: "NoModificationAllowedError",
  }),
);
ok("classify-locked", locked.kind === "locked", locked);

const missing = classifyExcelWriteError(
  Object.assign(new Error("not found"), { name: "NotFoundError" }),
);
ok("classify-not-found", missing.kind === "not_found", missing);
ok(
  "classify-not-found-mentions-save-as",
  missing.message.includes("다른 이름으로 저장"),
  missing,
);

const denied = classifyExcelWriteError(
  Object.assign(new Error("permission denied"), { name: "NotAllowedError" }),
);
ok("classify-permission", denied.kind === "permission", denied);

ok(
  "toast-overwrite",
  excelSaveToastMessage({
    mode: "overwrite",
    fileName: "일비서_2026-10-18.xlsx",
  }) === "저장했습니다 · 일비서_2026-10-18.xlsx",
);

const stamped = datedExcelFilename(new Date("2026-10-18T12:00:00+09:00"));
ok(
  "dated-filename-pattern",
  stamped === `일비서_${todayIsoKst(new Date("2026-10-18T12:00:00+09:00"))}.xlsx` &&
    /^일비서_\d{4}-\d{2}-\d{2}\.xlsx$/.test(stamped),
  stamped,
);
ok(
  "rename-needed-legacy",
  needsDatedExcelRename("일비서.xlsx", stamped) === true,
);
ok(
  "rename-not-needed-same-day",
  needsDatedExcelRename(stamped, stamped) === false,
);
ok(
  "toast-error-locked",
  excelSaveToastMessage({
    mode: "error",
    kind: "locked",
    message: locked.message,
  }) === locked.message,
);

const outDir =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "smoke-excel-overwrite-logic.json"),
  JSON.stringify({ ok: true, results }, null, 2),
);
console.log("SMOKE OK", results.length);
