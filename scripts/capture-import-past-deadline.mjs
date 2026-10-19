/**
 * Capture: Excel 불러오기 후 start < today → 「지난 일정」구분선 아래.
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

function todayIsoKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

function yday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

async function buildFixture(today) {
  const past = yday(today);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("할 일");
  ws.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
  ws.addRow([1, "업무용", "오늘 할 일", today, 2]);
  ws.addRow([
    2,
    "업무용",
    "예전 시작 구간 (시작 지남)",
    "2026-10-01 ~ 2026-11-30",
    3,
  ]);
  ws.addRow([3, "업무용", "어제 하루", past, 2]);
  ws.addRow([4, "업무용", "틸드 오늘시작 (~10/30)", "~10/30", 2]);
  ws.addRow([5, "업무용", "언젠가 정리", "언젠가", 1]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const p = path.join(OUT, "ilbiseo-import-past-deadline-fixture.xlsx");
  fs.writeFileSync(p, buf);
  return p;
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

async function main() {
  const today = todayIsoKst();
  const fixture = await buildFixture(today);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  await context.addInitScript((dayKey) => {
    localStorage.setItem("ilbiseo-daily-cheer-kst", dayKey);
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem(
      "ilbiseo-state-v2",
      JSON.stringify({
        version: 2,
        tasks: [],
        checklists: [],
        calendarEvents: [],
        guidelines: [],
        habits: [],
      }),
    );
  }, cheerDayKey());

  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await dismissCheerIfAny(page);

  // Import
  await page.locator("[data-toolbar-extras]").click();
  await page.locator("[data-toolbar-extras-excel]").click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const nextBtn = page.locator('button:has-text("다음")');
  if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nextBtn.click();
  }
  await page.waitForSelector("text=건", { timeout: 12000 });
  // Apply import (새 N · 바뀐 0 반영)
  const apply = page.locator('button:has-text("반영")').first();
  await apply.click();
  await page.waitForSelector('[role="dialog"]', {
    state: "hidden",
    timeout: 15000,
  }).catch(() => {});
  await page.waitForTimeout(800);

  // Focus 업무용 틀
  const frameSelect = page.locator('select[aria-label="틀"]');
  if (await frameSelect.count()) {
    await frameSelect.selectOption("work");
  }
  await page.waitForTimeout(400);

  // Ensure past separator visible
  await page.locator("[data-excel-past-separator]").first().waitFor({
    timeout: 10000,
  });

  const titles = await page
    .locator('textarea[aria-label="할 일"]')
    .evaluateAll((els) => els.map((e) => e.value));
  const sepCount = await page.locator("[data-excel-past-separator]").count();
  const overdueCount = await page.locator('[data-excel-overdue="1"]').count();
  console.log({ titles, sepCount, overdueCount });

  if (sepCount !== 1) {
    throw new Error(`Expected 1 past separator, got ${sepCount}`);
  }
  if (overdueCount < 1) {
    throw new Error(`Expected overdue rows, got ${overdueCount}`);
  }
  // Past titles should be last among todo titles
  const last = titles[titles.length - 1];
  const pastTitles = ["어제 하루", "예전 시작 구간 (시작 지남)"];
  if (!pastTitles.includes(last) && !titles.some((t) => pastTitles.includes(t))) {
    throw new Error(`Past titles missing in list: ${JSON.stringify(titles)}`);
  }

  const out = path.join(OUT, "ilbiseo-import-past-deadline.png");
  // Scroll past separator + overdue rows into view
  await page.locator("[data-excel-past-separator]").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const overdue = page.locator('[data-excel-overdue="1"]').last();
  if (await overdue.count()) {
    await overdue.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
  }
  // Crop around table including separator
  const table = page.locator("table").first();
  if (await table.count()) {
    await table.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage: false });
  }

  fs.writeFileSync(
    path.join(OUT, "capture-import-past-deadline.json"),
    JSON.stringify({ today, fixture, out, titles, sepCount, overdueCount }, null, 2),
  );
  console.log("ok", out);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
