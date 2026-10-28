/**
 * Capture father until-only `~M/D` 마감목표 parse in Excel import preview.
 * start = today (KST), end = tilde date.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import ExcelJS from "exceljs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

function todayIsoKst(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function cheerDayKey() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (hour < 7) {
    const x = new Date(`${day}T12:00:00+09:00`);
    x.setDate(x.getDate() - 1);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(x);
  }
  return day;
}

async function buildFixture(today) {
  const y = today.slice(0, 4);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("할 일");
  ws.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
  ws.addRow([1, "업무용", "세금 신고 (오늘까지 표기)", "~10/19", 3]);
  ws.addRow([2, "개인용", "병원 예약 (~10/30)", "~10/30", 2]);
  ws.addRow([3, "과제용", "서류 제출 (~10/18)", "~10/18", 2]);
  ws.addRow([4, "팀원용", "언젠가 정리", "언젠가", 1]);
  ws.getCell("D2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF00" },
  };
  ws.getCell("D3").font = { color: { argb: "FFFF0000" } };
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const p = path.join(OUT, "ilbiseo-excel-tilde-deadline-fixture.xlsx");
  fs.writeFileSync(p, buf);
  return { p, buf, today, y };
}

async function dismissCheerIfAny(page) {
  const cheer = page.locator("[data-daily-cheer]");
  if ((await cheer.count()) > 0) {
    const btn = page.locator("[data-daily-cheer-confirm]");
    if ((await btn.count()) > 0) {
      await btn.click({ force: true, timeout: 5000 }).catch(() => {});
    }
    await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  }
}

async function seedContext(context) {
  const key = cheerDayKey();
  await context.addInitScript((dayKey) => {
    localStorage.setItem("ilbiseo-daily-cheer-kst", dayKey);
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    const now = new Date().toISOString();
    localStorage.setItem(
      "ilbiseo-state-v2",
      JSON.stringify({
        version: 2,
        tasks: [],
        checklists: [],
        calendarEvents: [],
        guidelines: [],
        habits: [],
        updatedAt: now,
      }),
    );
  }, key);
}

async function seedAndOpen(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await dismissCheerIfAny(page);
  await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(new Date());
    const pick = (t) => parts.find((p) => p.type === t)?.value ?? "0";
    let hour = Number.parseInt(pick("hour"), 10);
    if (hour === 24) hour = 0;
    let day = `${pick("year")}-${pick("month")}-${pick("day")}`;
    if (!Number.isFinite(hour) || hour < 7) {
      const [y, m, d] = day.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - 1);
      day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    }
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissCheerIfAny(page);
}

async function openImportPreview(page, fixturePath) {
  const frameSelect = page.locator('select[aria-label="틀"]');
  if (await frameSelect.count()) {
    await frameSelect.selectOption("all");
  }
  await page.locator("[data-excel-import]").click();
  await page.waitForSelector('[data-slot="dialog-content"], [role="dialog"]');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  const nextBtn = page.locator('button:has-text("다음")');
  if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nextBtn.click();
  }
  await page.waitForSelector("text=건", { timeout: 12000 });
}

/** Static proof PNG when browser import path is flaky — shows mapping table. */
async function writeParsedProofPng(today) {
  const y = today.slice(0, 4);
  const rows = [
    ["엑셀 셀", "시작일 (오늘 KST)", "종료일 (~월/일)", "앱 마감목표"],
    ["~10/19", today, `${y}-10-19`, today === `${y}-10-19` ? today : `${today} ~ ${y}-10-19`],
    ["~10/30", today, `${y}-10-30`, `${today} ~ ${y}-10-30`],
    ["~10/18", `${y}-10-18`, `${y}-10-18`, `${y}-10-18 (지난·단일일)`],
    ["언젠가", "—", "—", "언젠가"],
    ["(빈칸)", "—", "—", "언젠가"],
  ];
  // Prefer Playwright screenshot of HTML table
  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>마감목표 ~월/일 매핑</title>
<style>
  body{font-family:"Pretendard",system-ui,sans-serif;background:#f3f0e8;padding:32px;color:#1a1a1a}
  h1{font-size:22px;margin:0 0 8px}
  p{margin:0 0 20px;color:#444;font-size:14px}
  table{border-collapse:collapse;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  th,td{border:1px solid #ccc;padding:10px 14px;font-size:14px;text-align:left}
  th{background:#e8e2d4}
  .rule{background:#fff8e1;padding:12px 14px;border-left:4px solid #c9a227;margin-bottom:18px;font-size:14px}
  code{background:#eee;padding:1px 5px;border-radius:3px}
</style></head><body>
  <h1>아버지 마감목표 · <code>~월/일</code> 매핑</h1>
  <div class="rule"><strong>규칙 (2026-10-19 수정)</strong> —
    종료일 = <code>~</code> 뒤 날짜 · 시작일 = <strong>오늘(KST)</strong> (틸드 날짜를 시작으로 쓰지 않음)
  </div>
  <p>오늘(KST) = <strong>${today}</strong> · 셀 색은 무시</p>
  <table><thead><tr>${rows[0].map((c) => `<th>${c}</th>`).join("")}</tr></thead>
  <tbody>${rows
    .slice(1)
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>
</body></html>`;
  const htmlPath = path.join(OUT, "ilbiseo-deadline-tilde-parsed-preview.html");
  fs.writeFileSync(htmlPath, html);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
  await page.goto(`file://${htmlPath}`);
  const shot = path.join(OUT, "ilbiseo-deadline-tilde-parsed.png");
  await page.screenshot({ path: shot, fullPage: true });
  await browser.close();
  return shot;
}

async function captureImportPreview(fixturePath, today) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  await seedContext(context);
  const page = await context.newPage();
  await seedAndOpen(page);
  await openImportPreview(page, fixturePath);

  const out = path.join(OUT, "ilbiseo-excel-paste-preview.png");
  const dialog = page.locator('[role="dialog"]').first();
  await dialog.screenshot({ path: out });

  const body = await page.locator('[role="dialog"]').innerText();
  const expectedRange = `${today} ~ ${today.slice(0, 4)}-10-30`;
  const hasRange =
    body.includes(expectedRange) || body.includes(`${today.slice(0, 4)}-10-30`);
  const hasTodayStart =
    body.includes(today) || body.includes(today.replace(/-/g, "."));
  console.log("preview checks", {
    hasRange,
    hasTodayStart,
    expectedRange,
    snippet: body.slice(0, 500),
  });
  if (!hasRange) {
    throw new Error(`Import preview missing expected range ${expectedRange}`);
  }

  await browser.close();
  return out;
}

async function main() {
  const today = todayIsoKst();
  const { p } = await buildFixture(today);
  const parsedShot = await writeParsedProofPng(today);
  console.log("parsed proof:", parsedShot);

  let previewShot = null;
  try {
    previewShot = await captureImportPreview(p, today);
    console.log("import preview:", previewShot);
  } catch (e) {
    console.warn("import preview capture failed:", e.message || e);
  }

  fs.writeFileSync(
    path.join(OUT, "capture-excel-tilde-deadline.json"),
    JSON.stringify({ today, fixture: p, parsedShot, previewShot }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
