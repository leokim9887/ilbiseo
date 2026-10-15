import fs from "node:fs";
import path from "node:path";
import {
  classifyExcelWriteError,
  excelSaveToastMessage,
  resolveSaveStrategy,
} from "../src/lib/excel-save-policy";

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
  excelSaveToastMessage({ mode: "overwrite", fileName: "일비서.xlsx" }) ===
    "기존 파일에 저장했습니다",
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
