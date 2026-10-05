import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:테스트
BEGIN:VEVENT
DTSTART:20261005T100000
DTEND:20261005T110000
SUMMARY:후보 인터뷰
END:VEVENT
BEGIN:VEVENT
DTSTART:20261008T150000
DTEND:20261008T160000
SUMMARY:주간 싱크
END:VEVENT
END:VCALENDAR`;

async function dismiss(page) {
  const btn = page.getByRole("button", { name: "시작하기" });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await dismiss(page);

  // Import ICS via calendar tab
  await page.getByRole("button", { name: /^캘린더/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder(/calendar\.google\.com|BEGIN:VCALENDAR/).fill(ICS);
  await page.getByRole("button", { name: /ICS \/ URL 가져오기/ }).click();
  await page.waitForTimeout(600);

  // Open 할 일 and select 구글 캘린더 frame
  await page.getByRole("button", { name: /^할 일/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByLabel("틀").selectOption("gcal");
  await page.waitForTimeout(500);
  await page.getByText("[캘린더]").first().waitFor({ timeout: 10000 });
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-frame-dropdown.png`,
    fullPage: true,
  });
  await page.locator(".excel-wb").screenshot({
    path: `${OUT}/ilbiseo-gcal-frame-today-forward.png`,
  });

  // Pick another day on calendar
  await page.getByRole("grid", { name: "날짜 선택 달력" }).waitFor();
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-frame-picker.png`,
    fullPage: true,
  });

  // Switch to work frame — no calendar rows
  await page.getByLabel("틀").selectOption("work");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-frame-work-only.png`,
    fullPage: true,
  });

  await page.close();
  const mobileCtx = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: "networkidle" });
  await dismiss(mobile);
  await mobile.getByRole("button", { name: /할 일/ }).first().click();
  await mobile.waitForTimeout(400);
  await mobile.getByLabel("틀").selectOption("gcal");
  await mobile.waitForTimeout(400);
  await mobile.screenshot({
    path: `${OUT}/ilbiseo-gcal-frame-mobile.png`,
    fullPage: true,
  });
  await mobileCtx.close();
  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
