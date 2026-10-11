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

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const denseDay = today;
const spanStart = addDays(today, -1);
const spanEndExclusive = addDays(today, 3); // all-day exclusive end → covers today

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ denseDay, spanStart, spanEndExclusive }) => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v1", "1");
    localStorage.setItem(
      "ilbiseo-state-v2",
      JSON.stringify({
        version: 3,
        tasks: [],
        checklists: [],
        calendarEvents: [
          {
            id: "ev-span",
            title: "출장 (연속 일정 전체제목)",
            start: spanStart,
            end: spanEndExclusive,
            allDay: true,
            notes: "span",
            source: "mock",
            calendarName: "업무",
          },
          {
            id: "ev-1",
            title: "아침 미팅 — 팀 싱크",
            start: `${denseDay}T09:00:00`,
            end: `${denseDay}T09:30:00`,
            allDay: false,
            notes: "",
            source: "mock",
            calendarName: "업무",
          },
          {
            id: "ev-2",
            title: "병원 예약 확인 전화",
            start: `${denseDay}T11:00:00`,
            end: `${denseDay}T11:20:00`,
            allDay: false,
            notes: "",
            source: "mock",
            calendarName: "개인",
          },
          {
            id: "ev-3",
            title: "점심 약속 — 김○○ 과장",
            start: `${denseDay}T12:30:00`,
            end: `${denseDay}T13:30:00`,
            allDay: false,
            notes: "",
            source: "mock",
            calendarName: "개인",
          },
          {
            id: "ev-4",
            title: "오후 보고서 마감 점검",
            start: `${denseDay}T15:00:00`,
            end: `${denseDay}T16:00:00`,
            allDay: false,
            notes: "",
            source: "mock",
            calendarName: "업무",
          },
          {
            id: "ev-5",
            title: "저녁 가족 통화",
            start: `${denseDay}T19:00:00`,
            end: `${denseDay}T19:30:00`,
            allDay: false,
            notes: "",
            source: "mock",
            calendarName: "개인",
          },
        ],
        guidelines: [],
        habits: [],
      }),
    );
  },
  { denseDay, spanStart, spanEndExclusive },
);

await page.goto(`${BASE}?view=calendar`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);

const cell = page.locator(`[data-cal-day="${denseDay}"]`);
if ((await cell.count()) !== 1) throw new Error("dense day cell missing");

const overflow = cell.locator("[data-cal-overflow]");
if ((await overflow.count()) !== 1) throw new Error("overflow +N control missing");
const overflowText = (await overflow.innerText()).trim();
if (!/^\+\d+건$/.test(overflowText)) {
  throw new Error(`unexpected overflow text: ${overflowText}`);
}

// Year/month picker still present
if ((await page.locator("[data-cal-year-select]").count()) !== 1) {
  throw new Error("year select missing");
}
if ((await page.locator("[data-cal-month-select]").count()) !== 1) {
  throw new Error("month select missing");
}

// Span bar still present
if ((await page.locator("[data-cal-span=ev-span]").count()) < 1) {
  throw new Error("multi-day span bar missing");
}

await overflow.click();
const detail = page.locator("[data-cal-day-detail]");
await detail.waitFor({ state: "visible", timeout: 5000 });

const listItems = page.locator("[data-cal-day-detail-event]");
const count = await listItems.count();
if (count !== 6) {
  throw new Error(`expected 6 day events (5 timed + 1 span), got ${count}`);
}

const spanInDetail = page.locator(
  '[data-cal-day-detail-event="ev-span"][data-cal-day-detail-span="1"]',
);
if ((await spanInDetail.count()) !== 1) {
  throw new Error("multi-day span missing from day detail list");
}

const titles = await listItems.allTextContents();
const joined = titles.join("\n");
for (const t of [
  "출장 (연속 일정 전체제목)",
  "아침 미팅 — 팀 싱크",
  "저녁 가족 통화",
]) {
  if (!joined.includes(t)) throw new Error(`missing full title: ${t}`);
}

await page.screenshot({
  path: `${OUT}/ilbiseo-calendar-day-detail.png`,
  fullPage: false,
});

// Dismiss via overlay / Escape
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
if (await detail.isVisible().catch(() => false)) {
  // overlay click fallback
  await page.locator("[data-slot='sheet-overlay']").click({ force: true });
  await page.waitForTimeout(300);
}
if (await detail.isVisible().catch(() => false)) {
  throw new Error("day detail did not dismiss");
}

// Re-open by clicking the day cell
await cell.click();
await detail.waitFor({ state: "visible", timeout: 5000 });
if ((await listItems.count()) !== 6) {
  throw new Error("re-open via day cell failed");
}

console.log("OK calendar-day-detail", {
  denseDay,
  overflowText,
  detailCount: 6,
  screenshot: `${OUT}/ilbiseo-calendar-day-detail.png`,
});

await browser.close();
