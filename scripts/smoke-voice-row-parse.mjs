/**
 * Smoke: Korean voice → 행 추가 field parse heuristics.
 * Run: node scripts/smoke-voice-row-parse.mjs
 * (spawns tsx on scripts/smoke-voice-row-parse.ts)
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = join(root, "scripts/smoke-voice-row-parse.ts");

const r = spawnSync("npx", ["--yes", "tsx", ts], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  stdio: "inherit",
});

process.exit(r.status ?? 1);
