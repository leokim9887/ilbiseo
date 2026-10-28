/**
 * Smoke: 「행 추가」 inserts at top; list stays newest-first;
 * 「지난 일정」 still sinks below the separator.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

const todayKst = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function yday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

const pastEnd = yday(todayKst);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

page.on("dialog", async (dialog) => {
  await dialog.accept();
});

// version 5 + already newest-first array (newer createdAt first)
const seed = {
  version: 5,
  tasks: [
    {
      id: "new1",
      title: "최근할일",
      category: "work",
      kind: "spot",
      startDate: todayKst,
      targetDate: todayKst,
      urgency: 2,
      importance: 2,
      groupKey: "최근",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-10T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "old1",
      title: "예전할일",
      category: "work",
      kind: "spot",
      startDate: todayKst,
      targetDate: todayKst,
      urgency: 1,
      importance: 1,
      groupKey: "예전",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "past1",
      title: "지난회의",
      category: "work",
      kind: "spot",
      startDate: pastEnd,
      targetDate: pastEnd,
      urgency: 3,
      importance: 3,
      groupKey: "지난",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-09-01T00:00:00.000Z",
      completedAt: null,
    },
  ],
  checklists: [],
  calendarEvents: [],
  guidelines: [],
  habits: [],
  deletions: {},
};

function cheerDayKey() {
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
  const y = Number(pick("year"));
  const m = Number(pick("month"));
  const d = Number(pick("day"));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(hour) || hour < 7) dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ s, dayKey }) => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-daily-cheer-kst", dayKey);
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(s));
  },
  { s: seed, dayKey: cheerDayKey() },
);
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const cheer = page.locator("[data-daily-cheer]");
if ((await cheer.count()) > 0) {
  await page.locator("[data-daily-cheer-confirm]").click({ force: true });
  await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}
await page.waitForTimeout(300);

await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(300);

const titlesBefore = await page
  .locator('textarea[aria-label="할 일"]')
  .evaluateAll((els) => els.map((e) => e.value));

const newestFirstBefore =
  titlesBefore[0] === "최근할일" &&
  titlesBefore[1] === "예전할일" &&
  titlesBefore[titlesBefore.length - 1] === "지난회의";

const separatorBefore =
  (await page.locator("[data-excel-past-separator]").count()) === 1;

await page.locator("[data-excel-add-row]").click();
await page.waitForTimeout(400);

const titlesAfter = await page
  .locator('textarea[aria-label="할 일"]')
  .evaluateAll((els) => els.map((e) => e.value));

// Blank new row at index 0; previous newest still next; past still last.
const blankOnTop = titlesAfter[0] === "";
const previousNewestSecond = titlesAfter[1] === "최근할일";
const pastStillLast =
  titlesAfter[titlesAfter.length - 1] === "지난회의";
const separatorAfter =
  (await page.locator("[data-excel-past-separator]").count()) === 1;

await page.screenshot({
  path: `${OUT}/ilbiseo-row-add-newest-first.png`,
  fullPage: false,
});

const ok =
  newestFirstBefore &&
  separatorBefore &&
  blankOnTop &&
  previousNewestSecond &&
  pastStillLast &&
  separatorAfter;

console.log(
  JSON.stringify(
    {
      ok,
      newestFirstBefore,
      titlesBefore,
      blankOnTop,
      previousNewestSecond,
      pastStillLast,
      separatorBefore,
      separatorAfter,
      titlesAfter,
      todayKst,
      pastEnd,
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(ok ? 0 : 1);
