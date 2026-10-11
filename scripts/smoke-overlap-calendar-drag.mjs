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

const endA = addDays(today, 3);
const farStart = addDays(today, 20);
const farEnd = addDays(today, 21);
const overlapEnd = addDays(today, 2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

const dialogs = [];
page.on("dialog", async (dialog) => {
  dialogs.push({ type: dialog.type(), message: dialog.message() });
  // default: dismiss (cancel) unless flagged
  if (page.__acceptOverlap) await dialog.accept();
  else await dialog.dismiss();
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ today, endA, farStart, farEnd }) => {
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
            title: "겹침-기존",
            category: "work",
            kind: "ongoing",
            startDate: today,
            targetDate: endA,
            urgency: 2,
            importance: 2,
            groupKey: "겹침기존",
            memo: "",
            source: "manual",
            status: "active",
            createdAt: now,
            completedAt: null,
          },
          {
            id: "t-b",
            title: "겹침-신규",
            category: "work",
            kind: "ongoing",
            startDate: farStart,
            targetDate: farEnd,
            urgency: 2,
            importance: 2,
            groupKey: "겹침신규",
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
          {
            id: "t-e",
            title: "드래그-C",
            category: "personal",
            kind: "spot",
            startDate: today,
            targetDate: today,
            urgency: 2,
            importance: 2,
            groupKey: "드래그c",
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
            id: "ev1",
            title: "샘플회의",
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
  { today, endA, farStart, farEnd },
);

await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);

// Open 겹침-신규 deadline and change start into A's window → confirm, cancel
const rowB = page.locator('tr[data-excel-row="t-b"]');
await rowB.locator("[data-excel-deadline-display]").click();
await page.waitForTimeout(120);
page.__acceptOverlap = false;
dialogs.length = 0;
await rowB.locator('input[aria-label="시작일"]').fill(today);
await page.waitForTimeout(250);

if (dialogs.length < 1) {
  throw new Error("expected overlap confirm when editing start into range");
}
if (!dialogs[0].message.includes("겹치는 일정이 있습니다")) {
  throw new Error(`bad dialog: ${dialogs[0].message}`);
}
if (!dialogs[0].message.includes("겹침-기존")) {
  throw new Error(`dialog missing peer title: ${dialogs[0].message}`);
}

const afterCancel = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
  return s.tasks.find((t) => t.id === "t-b");
});
if (afterCancel.startDate !== farStart) {
  throw new Error(
    `cancel should keep far start, got ${afterCancel.startDate}`,
  );
}

await page.screenshot({
  path: `${OUT}/ilbiseo-overlap-alert.png`,
  fullPage: true,
});

// Accept overlapping change (editor may still be open from cancel path)
page.__acceptOverlap = true;
dialogs.length = 0;
const startB = rowB.locator('input[aria-label="시작일"]');
const endB = rowB.locator('input[aria-label="종료일"]');
const displayB = rowB.locator("[data-excel-deadline-display]");
try {
  await startB.waitFor({ state: "visible", timeout: 1500 });
} catch {
  await displayB.click({ timeout: 5000 });
  await startB.waitFor({ state: "visible", timeout: 5000 });
}
await startB.fill(today);
await page.waitForTimeout(250);
if (dialogs.length < 1) {
  throw new Error("expected overlap confirm on accept path (start)");
}
// end may still be farEnd; tighten while accepting overlap
dialogs.length = 0;
await endB.fill(overlapEnd);
await page.waitForTimeout(250);
const afterAccept = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
  return s.tasks.find((t) => t.id === "t-b");
});
if (afterAccept.startDate !== today) {
  throw new Error(`accept should save start ${today}, got ${afterAccept.startDate}`);
}

// --- Drag paint select (checkbox column) ---
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
  throw new Error(`drag select expected >=2 selected, got ${selected}`);
}
const bulk = await page.locator("[data-excel-bulk-complete]").count();
if (bulk !== 1) throw new Error("bulk complete toolbar missing after drag select");

await page.screenshot({
  path: `${OUT}/ilbiseo-drag-select-rows.png`,
  fullPage: true,
});

// --- Month calendar ---
await page.goto(`${BASE}?view=calendar`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const grid = page.locator("[data-month-calendar]");
if ((await grid.count()) !== 1) {
  // maybe empty until sample — seed already has events
  if ((await page.getByRole("button", { name: "샘플" }).count()) > 0) {
    await page.getByRole("button", { name: "샘플" }).click();
    await page.waitForTimeout(300);
  }
}
if ((await page.locator("[data-month-calendar]").count()) !== 1) {
  throw new Error("month calendar grid missing");
}
if ((await page.getByText("ICS / iCal URL").count()) !== 0) {
  throw new Error("ICS import UI should be removed");
}
if ((await page.locator('ul[aria-label="캘린더 일정 목록"]').count()) !== 0) {
  throw new Error("event card list should be removed");
}
if ((await page.locator(`[data-cal-day="${today}"]`).count()) !== 1) {
  throw new Error("today cell missing on month grid");
}

await page.screenshot({
  path: `${OUT}/ilbiseo-month-calendar-grid.png`,
  fullPage: true,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      overlapDialogs: dialogs.length,
      dragSelected: selected,
      screenshots: [
        "ilbiseo-overlap-alert.png",
        "ilbiseo-drag-select-rows.png",
        "ilbiseo-month-calendar-grid.png",
      ],
    },
    null,
    2,
  ),
);

await browser.close();
