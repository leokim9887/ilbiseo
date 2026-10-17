/**
 * Capture father-facing Excel 마감목표 entry aids (validation list + 언젠가).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";

const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

const dump = spawnSync(
  "npx",
  ["tsx", "scripts/dump-excel-deadline-entry.ts"],
  {
    cwd: "/workspace",
    encoding: "utf8",
    env: { ...process.env, OUT_DIR: OUT },
    maxBuffer: 4 * 1024 * 1024,
  },
);
if (dump.status !== 0) {
  console.error(dump.stderr || dump.stdout);
  process.exit(1);
}

const info = JSON.parse(readFileSync(`${OUT}/smoke-excel-deadline-entry.json`, "utf8"));
const listItems = String(info.listFormulae?.[0] || info.formula || "")
  .replace(/^"|"$/g, "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>일비서 Excel 마감목표 입력</title>
<style>
  body { margin: 0; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    background: #e8efe9; color: #1a2420; }
  .sheet { margin: 24px auto; width: 720px; background: #fff; border: 1px solid #217346;
    box-shadow: 0 8px 24px rgba(0,0,0,.08); }
  .title { background: #217346; color: #fff; padding: 12px 16px; font-size: 18px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 10px 12px; font-size: 15px; }
  th { background: #f3f3f3; }
  .deadline { background: #fff8e8; position: relative; vertical-align: top; }
  .badge { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 4px;
    background: #217346; color: #fff; font-size: 12px; font-weight: 700; }
  .dropdown { margin: 8px 0 0; border: 1px solid #217346; background: #fff; width: 260px; }
  .dropdown div { padding: 8px 10px; border-bottom: 1px solid #e5e5e5; }
  .dropdown div:last-child { border-bottom: 0; }
  .dropdown .pick { background: #e8f5ee; font-weight: 700; }
  .help { margin: 16px; padding: 14px 16px; background: #f7f0e6; border-left: 4px solid #8a5a2b;
    white-space: pre-line; font-size: 14px; line-height: 1.55; }
  .prompt { margin: 0 16px 16px; padding: 10px 12px; background: #eef6f1; border: 1px solid #21734655;
    font-size: 13.5px; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="title">Excel 「할 일」· 마감목표 — 쉬운 입력 (언젠가 · 날짜 · 구간)</div>
    <table>
      <thead>
        <tr>
          <th>순서</th><th>틀</th><th>할 일</th>
          <th>마감목표 <span class="badge">▾ 목록</span></th><th>중요도</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td><td>업무용</td><td>샘플</td>
          <td class="deadline">
            <div>${info.today || listItems[1] || ""}</div>
            <div class="dropdown">
              ${listItems
                .map(
                  (it) =>
                    `<div class="${it === "언젠가" ? "pick" : ""}">${it}${
                      it === "언젠가" ? " ← 선택" : ""
                    }</div>`,
                )
                .join("")}
            </div>
          </td>
          <td>2</td>
        </tr>
        <tr>
          <td>2</td><td>업무용</td><td>언젠가할일</td>
          <td class="deadline"><strong>언젠가</strong></td>
          <td>1</td>
        </tr>
      </tbody>
    </table>
    <div class="prompt"><strong>${info.promptTitle || "마감목표"}</strong> — ${
      info.prompt || ""
    }</div>
    <div class="help">${String(info.help || info.noteText || "").replace(/</g, "&lt;")}</div>
  </div>
</body>
</html>`;

const htmlPath = `${OUT}/ilbiseo-excel-deadline-entry-preview.html`;
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 720 } });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.screenshot({
  path: `${OUT}/ilbiseo-excel-deadline-entry.png`,
  fullPage: false,
});
await browser.close();

const ok =
  listItems.includes("언젠가") &&
  String(info.help || info.noteText || "").includes("언젠가");

console.log(
  JSON.stringify(
    { ok, listItems, outPng: `${OUT}/ilbiseo-excel-deadline-entry.png` },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
