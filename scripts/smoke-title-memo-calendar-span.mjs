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
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Mirror of src/lib/calendar-span.ts for smoke assertions. */
function eventInclusiveDayRange(ev) {
  const startDay = ev.start.slice(0, 10);
  const endRaw = (ev.end || "").trim();
  const endDayRaw = endRaw ? endRaw.slice(0, 10) : startDay;
  const allDay = ev.allDay || ev.start.length === 10;
  if (allDay) {
    if (!endRaw || endDayRaw === startDay) {
      return { startDay, endDay: startDay, multiDay: false };
    }
    const endInclusive = addDays(endDayRaw, -1);
    if (endInclusive < startDay) {
      return { startDay, endDay: startDay, multiDay: false };
    }
    return {
      startDay,
      endDay: endInclusive,
      multiDay: endInclusive > startDay,
    };
  }
  let endDay = endDayRaw || startDay;
  if (endDay < startDay) endDay = startDay;
  return {
    startDay,
    endDay,
    multiDay: endDay > startDay,
  };
}

// --- Pure range detection (no browser) ---
{
  const singleAllDay = eventInclusiveDayRange({
    start: "2026-10-12",
    end: "2026-10-13",
    allDay: true,
  });
  if (singleAllDay.multiDay || singleAllDay.endDay !== "2026-10-12") {
    throw new Error(
      `all-day exclusive+1 should be single day, got ${JSON.stringify(singleAllDay)}`,
    );
  }

  const longAllDay = eventInclusiveDayRange({
    start: "2026-10-13",
    end: "2026-10-17",
    allDay: true,
  });
  if (
    !longAllDay.multiDay ||
    longAllDay.startDay !== "2026-10-13" ||
    longAllDay.endDay !== "2026-10-16"
  ) {
    throw new Error(
      `all-day 13→17 exclusive should be 13–16, got ${JSON.stringify(longAllDay)}`,
    );
  }

  const timedSpan = eventInclusiveDayRange({
    start: "2026-10-13T09:00:00",
    end: "2026-10-16T18:00:00",
    allDay: false,
  });
  if (
    !timedSpan.multiDay ||
    timedSpan.startDay !== "2026-10-13" ||
    timedSpan.endDay !== "2026-10-16"
  ) {
    throw new Error(`timed multi-day failed: ${JSON.stringify(timedSpan)}`);
  }
}

const spanStart = addDays(today, 2);
const spanEndExclusive = addDays(today, 6); // inclusive through +5
const singleAllDayStart = addDays(today, 5);
const singleAllDayEnd = addDays(today, 6);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

const nativeDialogs = [];
page.on("dialog", async (dialog) => {
  nativeDialogs.push(dialog.message());
  await dialog.dismiss();
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ today, spanStart, spanEndExclusive, singleAllDayStart, singleAllDayEnd }) => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v1", "1");
    const now = new Date().toISOString();
    localStorage.setItem(
      "ilbiseo-state-v2",
      JSON.stringify({
        version: 3,
        tasks: [
          {
            id: "t-a",
            title: "병원 진료 예약 확인",
            category: "work",
            kind: "ongoing",
            startDate: today,
            targetDate: today,
            urgency: 2,
            importance: 2,
            groupKey: "병원",
            memo: "서류 준비",
            source: "manual",
            status: "active",
            createdAt: now,
            completedAt: null,
          },
          {
            id: "t-b",
            title: "새 할일",
            category: "work",
            kind: "spot",
            startDate: today,
            targetDate: today,
            urgency: 2,
            importance: 2,
            groupKey: "새할일",
            memo: "",
            source: "manual",
            status: "active",
            createdAt: now,
            completedAt: null,
          },
          {
            id: "t-c",
            title: "드래그-A",
            category: "work",
            kind: "spot",
            startDate: today,
            targetDate: today,
            urgency: 2,
            importance: 2,
            groupKey: "드래그a",
            memo: "",
            source: "manual",
            status: "active",
            createdAt: now,
            completedAt: null,
          },
          {
            id: "t-d",
            title: "드래그-B",
            category: "work",
            kind: "spot",
            startDate: today,
            targetDate: today,
            urgency: 2,
            importance: 2,
            groupKey: "드래그b",
            memo: "",
            source: "manual",
            status: "active",
            createdAt: now,
            completedAt: null,
          },
        ],
        checklists: [],
        calendarEvents: [
          {
            id: "ev-single",
            title: "샘플회의",
            start: `${today}T10:00:00`,
            end: `${today}T11:00:00`,
            allDay: false,
            notes: "",
            source: "mock",
            calendarName: "mock",
          },
          {
            id: "ev-allday-1",
            title: "하루종일-세미나",
            start: singleAllDayStart,
            end: singleAllDayEnd,
            allDay: true,
            notes: "exclusive end +1",
            source: "mock",
            calendarName: "mock",
          },
          {
            id: "ev-span",
            title: "출장연속",
            start: spanStart,
            end: spanEndExclusive,
            allDay: true,
            notes: "multi-day bar",
            source: "mock",
            calendarName: "mock",
          },
        ],
        guidelines: [],
        habits: [],
      }),
    );
  },
  { today, spanStart, spanEndExclusive, singleAllDayStart, singleAllDayEnd },
);

await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);

// Deadline change into overlapping dates must NOT open native confirm
const rowB = page.locator('tr[data-excel-row="t-b"]');
await rowB.locator("[data-excel-deadline-display]").click();
await page.waitForTimeout(120);
await rowB.locator('input[aria-label="시작일"]').fill(today);
await page.waitForTimeout(200);
if (nativeDialogs.length > 0) {
  throw new Error(
    `date-range overlap confirm should be gone, got: ${nativeDialogs[0]}`,
  );
}

// Title similarity → polished dialog
const titleB = rowB.locator('textarea[aria-label="할일 LIST UP"]');
await titleB.fill("병원 진료 예약 점검");
await titleB.blur();
await page.waitForTimeout(900);

const alert = page.locator("[data-similarity-alert]");
await alert.waitFor({ state: "visible", timeout: 5000 });
const alertText = await alert.innerText();
if (!alertText.includes("비슷한 할 일")) {
  throw new Error(`bad similarity alert: ${alertText}`);
}
if (!alertText.includes("병원 진료 예약 확인")) {
  throw new Error(`alert missing peer title: ${alertText}`);
}

await page.screenshot({
  path: `${OUT}/ilbiseo-title-memo-similarity-alert.png`,
  fullPage: true,
});

await page.locator("[data-similarity-alert-ok]").click();
await page.waitForTimeout(200);
if (await alert.isVisible().catch(() => false)) {
  // dialog may unmount
}
const stillOpen = await page.locator("[data-similarity-alert]").count();
// After acknowledge, dialog closed; editing continues (title kept)
const titleKept = await titleB.inputValue();
if (titleKept !== "병원 진료 예약 점검") {
  throw new Error(`title should remain after ack, got ${titleKept}`);
}

// Drag select still works
const checkA = page.locator('input[data-excel-row-check="t-c"]');
const checkB = page.locator('input[data-excel-row-check="t-d"]');
const box0 = await checkA.boundingBox();
const box1 = await checkB.boundingBox();
if (!box0 || !box1) throw new Error("checkbox boxes missing");
await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
await page.mouse.down();
await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2, {
  steps: 10,
});
await page.mouse.up();
await page.waitForTimeout(200);
const selected = await page.locator('tr[data-excel-row-selected="1"]').count();
if (selected < 2) {
  throw new Error(`drag select expected >=2, got ${selected}`);
}

await page.screenshot({
  path: `${OUT}/ilbiseo-drag-select-rows.png`,
  fullPage: true,
});

// Month calendar spans
await page.goto(`${BASE}?view=calendar`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

if ((await page.locator("[data-month-calendar]").count()) !== 1) {
  throw new Error("month calendar grid missing");
}
if ((await page.getByText("ICS / iCal URL").count()) !== 0) {
  throw new Error("ICS import UI should stay removed");
}
if ((await page.locator('ul[aria-label="캘린더 일정 목록"]').count()) !== 0) {
  throw new Error("event card list should stay removed");
}

const spanBar = page.locator('[data-cal-span="ev-span"]');
if ((await spanBar.count()) < 1) {
  throw new Error("multi-day span bar missing for 출장연속");
}

// All-day exclusive+1 must NOT appear as span, and only on start day
const allDaySpan = page.locator('[data-cal-span="ev-allday-1"]');
if ((await allDaySpan.count()) !== 0) {
  throw new Error("exclusive+1 all-day should not be a span bar");
}
const singleOnStart = page.locator(
  `[data-cal-day="${singleAllDayStart}"] [data-cal-event="ev-allday-1"]`,
);
if ((await singleOnStart.count()) !== 1) {
  throw new Error("exclusive+1 all-day should show as single on start day");
}
const singleOnEnd = page.locator(
  `[data-cal-day="${singleAllDayEnd}"] [data-cal-event="ev-allday-1"]`,
);
if ((await singleOnEnd.count()) !== 0) {
  throw new Error("exclusive+1 all-day must not duplicate on exclusive end day");
}

// Span must not duplicate as per-day singles
const spanSingles = page.locator('[data-cal-single="1"][data-cal-event="ev-span"]');
if ((await spanSingles.count()) !== 0) {
  throw new Error("multi-day event should not also render as per-day chips");
}

await page.screenshot({
  path: `${OUT}/ilbiseo-month-calendar-span.png`,
  fullPage: true,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      nativeDialogs: nativeDialogs.length,
      similarityAlertClosed: stillOpen,
      dragSelected: selected,
      screenshots: [
        "ilbiseo-title-memo-similarity-alert.png",
        "ilbiseo-drag-select-rows.png",
        "ilbiseo-month-calendar-span.png",
      ],
    },
    null,
    2,
  ),
);

await browser.close();
