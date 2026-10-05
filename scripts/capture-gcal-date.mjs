import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20261005T100000
DTEND:20261005T110000
SUMMARY:오늘 미팅
END:VEVENT
BEGIN:VEVENT
DTSTART:20250915T090000
DTEND:20250915T100000
SUMMARY:작년 일정
END:VEVENT
END:VCALENDAR`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  const start = page.getByRole("button", { name: "시작하기" });
  if (await start.isVisible().catch(() => false)) await start.click();

  await page.getByRole("button", { name: /^캘린더/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByPlaceholder(/calendar\.google\.com|BEGIN:VCALENDAR/).fill(ICS);
  await page.getByRole("button", { name: /ICS \/ URL 가져오기/ }).click();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: /^할 일/ }).first().click();
  await page.getByLabel("틀").selectOption("gcal");
  await page.waitForTimeout(400);

  // default 오늘부터 — no 「이날부터 앞으로」
  await page.getByRole("button", { name: "오늘부터", exact: true }).waitFor();
  const bad = await page.getByRole("button", { name: "이날부터 앞으로" }).count();
  if (bad > 0) throw new Error("이날부터 앞으로 still present");

  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-date-bar.png`,
    fullPage: true,
  });
  await page.locator(".excel-wb").screenshot({
    path: `${OUT}/ilbiseo-gcal-date-sheet.png`,
  });

  // year dropdown
  await page.getByLabel("연도 선택").selectOption("2025");
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-date-year.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "이날만", exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-date-day-only.png`,
    fullPage: true,
  });

  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
