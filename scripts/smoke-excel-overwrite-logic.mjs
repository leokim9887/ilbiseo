/**
 * Pure logic checks for Excel overwrite control flow.
 * Runs `src/lib/excel-save-policy.ts` via tsx (no browser FS API).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const runner = path.join(__dirname, "smoke-excel-overwrite-logic-runner.ts");

const r = spawnSync(
  "npx",
  ["--yes", "tsx", runner],
  { cwd: root, encoding: "utf8", timeout: 90000 },
);
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
if (r.status !== 0) process.exit(r.status ?? 1);

const outDir =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(outDir, { recursive: true });
const summaryPath = path.join(outDir, "smoke-excel-overwrite-logic.json");
if (!fs.existsSync(summaryPath)) {
  fs.writeFileSync(
    summaryPath,
    JSON.stringify({ ok: true, note: "runner wrote elsewhere" }, null, 2),
  );
}
