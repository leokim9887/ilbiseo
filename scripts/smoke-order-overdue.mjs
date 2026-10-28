/**
 * Smoke: stable LIST UP order while typing + start min=today(KST).
 * Overdue stay-in-틀 / separator: see smoke-all-no-add-auto-done.mjs.
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

page.on("dialog", async (dialog) => {
  await dialog.accept();
});

// v5: array is newest-first (a1 stored above a2 for this stability check)
const seed = {
  version: 5,
  tasks: [
    {
      id: "a1",
      title: "첫번째",
      category: "work",
      kind: "spot",
      startDate: todayKst,
      targetDate: todayKst,
      urgency: 2,
      importance: 2,
      groupKey: "첫번째",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-02T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "a2",
      title: "두번째",
      category: "work",
      kind: "spot",
      startDate: todayKst,
      targetDate: todayKst,
      urgency: 1,
      importance: 1,
      groupKey: "두번째",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
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

const first = page.locator('textarea[aria-label="할 일"]').first();
await first.click();
await first.fill("첫번째-타이핑중-가나다라마바사");
await page.waitForTimeout(200);

const titlesAfter = await page
  .locator('textarea[aria-label="할 일"]')
  .evaluateAll((els) => els.map((e) => e.value));

const orderStable =
  titlesAfter[0].startsWith("첫번째") &&
  titlesAfter[1] === "두번째" &&
  titlesBefore.length === 2;

await page.locator('button[aria-label="마감목표"]').first().click();
await page.waitForTimeout(150);
const startMin = await page
  .locator('input[aria-label="시작일"]')
  .first()
  .getAttribute("min");

await page.screenshot({
  path: `${OUT}/ilbiseo-order-overdue-dense.png`,
  fullPage: false,
});

const ok = orderStable && startMin === todayKst;

console.log(
  JSON.stringify(
    {
      ok,
      orderStable,
      titlesBefore,
      titlesAfter,
      startMin,
      todayKst,
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(ok ? 0 : 1);
