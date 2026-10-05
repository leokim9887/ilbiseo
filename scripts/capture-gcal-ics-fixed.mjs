import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
X-WR-CALNAME:Father Test
BEGIN:VEVENT
DTSTART:20261005T140000Z
DTEND:20261005T150000Z
SUMMARY:iCal URL fix demo
END:VEVENT
END:VCALENDAR`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const btn = page.getByRole("button", { name: "시작하기" });
  if (await btn.isVisible().catch(() => false)) await btn.click();

  await page.getByRole("button", { name: /^캘린더/ }).first().click();
  await page.waitForTimeout(400);

  // URL-shaped input (server would fetch; use ICS body to prove parser in UI)
  await page.getByPlaceholder(/calendar\.google\.com|BEGIN:VCALENDAR/).fill(
    "https://calendar.google.com/calendar/ical/test%40group.calendar.google.com/public/basic.ics",
  );
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-ics-fixed-url-paste.png`,
    fullPage: true,
  });

  await page.getByPlaceholder(/calendar\.google\.com|BEGIN:VCALENDAR/).fill(SAMPLE);
  await page.getByRole("button", { name: /ICS \/ URL 가져오기/ }).click();
  await page.waitForTimeout(800);
  await page.getByText("iCal URL fix demo").waitFor({ timeout: 10000 });
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-ics-fixed-success.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: /^할 일/ }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-ics-fixed-separate-workbook.png`,
    fullPage: true,
  });

  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
