import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE_URL || "http://localhost:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const [todayY, todayM] = today.split("-").map(Number);
const pickYear = todayY - 1;
const pickMonthIndex = (todayM % 12); // 0–11; next month index wrapping Dec→Jan label 1월 when today is Dec → use (todayM % 12) which for Oct(10) = 10 → 11월 (index 10)

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ today }) => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v1", "1");
    const now = new Date().toISOString();
    localStorage.setItem(
      "ilbiseo-state-v2",
      JSON.stringify({
        version: 3,
        tasks: [],
        checklists: [],
        calendarEvents: [
          {
            id: "ev-today",
            title: "오늘일정",
            start: `${today}T10:00:00`,
            end: `${today}T11:00:00`,
            allDay: false,
            notes: "",
            source: "mock",
            calendarName: "mock",
          },
        ],
        guidelines: [],
        habits: [],
      }),
    );
  },
  { today },
);

await page.goto(`${BASE}?view=calendar`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const cal = page.locator("[data-month-calendar]");
if ((await cal.count()) !== 1) throw new Error("month calendar missing");

const yearSelect = page.locator("[data-cal-year-select]");
const monthSelect = page.locator("[data-cal-month-select]");
if ((await yearSelect.count()) !== 1) throw new Error("year select missing");
if ((await monthSelect.count()) !== 1) throw new Error("month select missing");

// Prev/오늘/다음 still present
for (const label of ["이전", "오늘", "다음"]) {
  if ((await page.getByRole("button", { name: label }).count()) < 1) {
    throw new Error(`nav button missing: ${label}`);
  }
}

const initialYear = Number(await yearSelect.inputValue());
const initialMonth = Number(await monthSelect.inputValue());
if (initialYear !== todayY || initialMonth !== todayM - 1) {
  throw new Error(
    `expected today ${todayY}-${todayM}, got ${initialYear}-${initialMonth + 1}`,
  );
}

await yearSelect.selectOption(String(pickYear));
await page.waitForTimeout(150);
await monthSelect.selectOption(String(pickMonthIndex));
await page.waitForTimeout(200);

if (Number(await yearSelect.inputValue()) !== pickYear) {
  throw new Error("year select did not stick");
}
if (Number(await monthSelect.inputValue()) !== pickMonthIndex) {
  throw new Error("month select did not stick");
}

const gridLabel = await page
  .locator('[role="grid"]')
  .getAttribute("aria-label");
const expectedLabel = `${pickYear}년 ${pickMonthIndex + 1}월 캘린더`;
if (gridLabel !== expectedLabel) {
  throw new Error(`grid aria-label expected ${expectedLabel}, got ${gridLabel}`);
}

// Jump back with 오늘
await page.getByRole("button", { name: "오늘" }).click();
await page.waitForTimeout(150);
if (Number(await yearSelect.inputValue()) !== todayY) {
  throw new Error("오늘 did not restore year");
}
if (Number(await monthSelect.inputValue()) !== todayM - 1) {
  throw new Error("오늘 did not restore month");
}

// Prev/next still move one month
await page.getByRole("button", { name: "다음" }).click();
await page.waitForTimeout(120);
let y = Number(await yearSelect.inputValue());
let m = Number(await monthSelect.inputValue());
const afterNext = new Date(todayY, todayM - 1 + 1, 1);
if (y !== afterNext.getFullYear() || m !== afterNext.getMonth()) {
  throw new Error(
    `다음 failed: expected ${afterNext.getFullYear()}-${afterNext.getMonth() + 1}, got ${y}-${m + 1}`,
  );
}

await page.getByRole("button", { name: "이전" }).click();
await page.waitForTimeout(120);
y = Number(await yearSelect.inputValue());
m = Number(await monthSelect.inputValue());
if (y !== todayY || m !== todayM - 1) {
  throw new Error("이전 did not return to current month");
}

// Screenshot with a clearly different year/month selected
await yearSelect.selectOption(String(pickYear));
await monthSelect.selectOption("0"); // 1월
await page.waitForTimeout(200);

await page.locator("[data-month-calendar]").screenshot({
  path: `${OUT}/ilbiseo-calendar-year-month.png`,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      today,
      picked: { year: pickYear, month: 1 },
      screenshot: "ilbiseo-calendar-year-month.png",
    },
    null,
    2,
  ),
);

await browser.close();
