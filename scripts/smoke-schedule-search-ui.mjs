/**
 * Smoke: schedule search filters rows + empty state + side hit.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
page.on("dialog", async (d) => d.accept());

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

const seed = {
  version: 5,
  tasks: [
    {
      id: "t1",
      title: "병원 예약",
      category: "personal",
      kind: "spot",
      startDate: "2026-10-30",
      targetDate: "2026-10-30",
      urgency: 2,
      importance: 3,
      groupKey: "",
      memo: "내과",
      source: "manual",
      status: "active",
      createdAt: "2026-10-28T01:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t2",
      title: "장보기",
      category: "personal",
      kind: "spot",
      startDate: "2026-10-29",
      targetDate: "2026-10-29",
      urgency: 2,
      importance: 1,
      groupKey: "",
      memo: "우유",
      source: "manual",
      status: "active",
      createdAt: "2026-10-28T02:00:00.000Z",
      completedAt: null,
    },
  ],
  checklists: [],
  calendarEvents: [],
  guidelines: [
    {
      id: "g1",
      title: "약 챙기기",
      memo: "병원 후",
      done: false,
      createdAt: "2026-10-28T00:00:00.000Z",
      completedAt: null,
    },
  ],
  habits: [
    {
      id: "h1",
      title: "아침 스트레칭",
      memo: "",
      done: false,
      createdAt: "2026-10-28T00:00:00.000Z",
      completedAt: null,
    },
  ],
  deletions: {},
};

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ seed, cheer }) => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-daily-cheer-kst", cheer);
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(seed));
  },
  { seed, cheer: cheerDayKey() },
);
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const cheer = page.locator("[data-daily-cheer]");
if ((await cheer.count()) > 0) {
  await page.locator("[data-daily-cheer-confirm]").click({ force: true });
  await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}

await page.locator('select[aria-label="틀"]').selectOption("personal");
await page.waitForTimeout(200);

const input = page.locator("[data-schedule-search-input]");
await input.waitFor({ state: "visible", timeout: 8000 });
await input.fill("병원");
await page.waitForTimeout(250);

const rows = page.locator("[data-excel-row]");
const rowCount = await rows.count();
if (rowCount !== 1) throw new Error(`expected 1 row after search, got ${rowCount}`);
const title = await page.locator('textarea[aria-label="할 일"]').first().inputValue();
if (title !== "병원 예약") throw new Error(`title=${title}`);

const countText = await page.locator("[data-schedule-search-count]").innerText();
if (!countText.includes("1건")) throw new Error(`count=${countText}`);

const sideHit = page.locator("[data-schedule-search-side-hit]");
if ((await sideHit.count()) < 1) throw new Error("expected side hit for 약 챙기기");

await page.screenshot({
  path: join(OUT, "ilbiseo-schedule-search-hit.png"),
  fullPage: false,
});

await input.fill("없는검색어xyz");
await page.waitForTimeout(250);
const empty = page.locator("[data-schedule-search-empty]");
await empty.waitFor({ state: "visible", timeout: 5000 });
await page.screenshot({
  path: join(OUT, "ilbiseo-schedule-search-empty.png"),
  fullPage: false,
});

await page.locator("[data-schedule-search-clear]").click();
await page.waitForTimeout(200);
if ((await rows.count()) < 2) throw new Error("clear should restore rows");

await page.screenshot({
  path: join(OUT, "ilbiseo-schedule-search-toolbar.png"),
  fullPage: false,
});

// Desktop
const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
desk.on("dialog", async (d) => d.accept());
await desk.goto(BASE, { waitUntil: "domcontentloaded" });
await desk.evaluate(
  ({ seed, cheer }) => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-daily-cheer-kst", cheer);
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(seed));
  },
  { seed, cheer: cheerDayKey() },
);
await desk.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await desk.waitForTimeout(400);
const cheer2 = desk.locator("[data-daily-cheer]");
if ((await cheer2.count()) > 0) {
  await desk.locator("[data-daily-cheer-confirm]").click({ force: true });
  await cheer2.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}
await desk.locator('select[aria-label="틀"]').selectOption("personal");
await desk.locator("[data-schedule-search-input]").fill("장보기");
await desk.waitForTimeout(250);
await desk.screenshot({
  path: join(OUT, "ilbiseo-schedule-search-desktop.png"),
  fullPage: false,
});
await desk.close();

console.log(JSON.stringify({ ok: true, mobileHit: title, countText }));
await browser.close();
