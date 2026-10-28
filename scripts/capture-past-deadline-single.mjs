/**
 * Capture: past 마감목표 after import shows as single day (not range-to-today).
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
  ws.addRow([1, "개인용", "오늘 할 일", today, 2]);
  ws.addRow([2, "개인용", "틸드 미래 (~10/30)", "~10/30", 2]);
  ws.addRow([3, "개인용", "틸드 과거 (~10/18)", "~10/18", 2]);
  ws.addRow([4, "개인용", "어제 하루", past, 2]);
  ws.addRow([5, "개인용", "잘못된 구간(과거~오늘)", `${past} ~ ${today}`, 2]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const p = path.join(OUT, "ilbiseo-past-deadline-single-fixture.xlsx");
  fs.writeFileSync(p, buf);
  return { p, past, today };
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
  const { p: fixture, past } = await buildFixture(today);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
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

  await page.locator("[data-excel-import]").click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const nextBtn = page.locator('button:has-text("다음")');
  if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nextBtn.click();
  }
  await page.waitForSelector("text=건", { timeout: 12000 });
  await page.locator('button:has-text("반영")').first().click();
  await page
    .waitForSelector('[role="dialog"]', { state: "hidden", timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(700);

  const frameSelect = page.locator('select[aria-label="틀"]');
  if (await frameSelect.count()) await frameSelect.selectOption("personal");
  await page.waitForTimeout(400);
  await page.locator("[data-excel-past-separator]").first().waitFor({
    timeout: 10000,
  });
  await page.evaluate(() => {
    document
      .querySelector("[data-excel-past-separator]")
      ?.scrollIntoView({ block: "center" });
    const overdue = document.querySelectorAll('[data-excel-overdue="1"]');
    overdue[overdue.length - 1]?.scrollIntoView({ block: "end" });
  });
  await page.waitForTimeout(250);

  // Collect deadline texts from past rows
  const pastDeadlines = await page
    .locator('[data-excel-overdue="1"]')
    .evaluateAll((rows) =>
      rows.map((r) => {
        const title =
          r.querySelector('textarea[aria-label="할 일"]')?.value || "";
        const dl =
          r.querySelector('[aria-label="마감목표"]')?.textContent?.trim() ||
          r.textContent ||
          "";
        return { title, dl: dl.replace(/\s+/g, " ").slice(0, 80) };
      }),
    );
  console.log("past rows", pastDeadlines);

  // Assert no past row shows range with today
  for (const row of pastDeadlines) {
    if (row.dl.includes("~") && row.dl.includes(today)) {
      throw new Error(
        `Past row still shows range-with-today: ${JSON.stringify(row)}`,
      );
    }
    if (row.title.includes("틸드 과거") || row.title.includes("어제") || row.title.includes("잘못된")) {
      if (!row.dl.includes(past) && !row.dl.includes("2026-10-18")) {
        throw new Error(`Expected past single date in ${JSON.stringify(row)}`);
      }
    }
  }

  const out = path.join(OUT, "ilbiseo-past-deadline-single.png");
  await page.screenshot({ path: out, fullPage: true });
  fs.writeFileSync(
    path.join(OUT, "capture-past-deadline-single.json"),
    JSON.stringify({ today, past, fixture, out, pastDeadlines }, null, 2),
  );
  console.log("ok", out);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
