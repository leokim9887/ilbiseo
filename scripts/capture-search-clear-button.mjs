/**
 * Capture: schedule search shows a single custom clear (X) button.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

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
  ],
  checklists: [],
  calendarEvents: [],
  guidelines: [],
  habits: [],
  deletions: {},
};

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
page.on("dialog", async (d) => d.accept());

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

const meta = await page.evaluate(() => {
  const el = document.querySelector("[data-schedule-search-input]");
  if (!(el instanceof HTMLInputElement)) return null;
  const clearBtns = document.querySelectorAll("[data-schedule-search-clear]");
  const label = el.closest("label");
  const buttonsInLabel = label
    ? Array.from(label.querySelectorAll("button")).map((b) => ({
        aria: b.getAttribute("aria-label"),
        data: b.getAttribute("data-schedule-search-clear"),
      }))
    : [];
  return {
    type: el.type,
    role: el.getAttribute("role"),
    inputMode: el.inputMode,
    clearCount: clearBtns.length,
    buttonsInLabel,
  };
});

if (!meta) throw new Error("search input missing");
if (meta.type !== "text") throw new Error(`expected type=text, got ${meta.type}`);
if (meta.clearCount !== 1) {
  throw new Error(`expected 1 custom clear, got ${meta.clearCount}`);
}
if (meta.buttonsInLabel.length !== 1) {
  throw new Error(
    `expected 1 button in search label, got ${JSON.stringify(meta.buttonsInLabel)}`,
  );
}

const box = page.locator("[data-schedule-search]");
await box.screenshot({
  path: join(OUT, "ilbiseo-search-clear-single.png"),
});

// Dark mode close-up (matches bug screenshot context)
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.waitForTimeout(150);
await box.screenshot({
  path: join(OUT, "ilbiseo-search-clear-single-dark.png"),
});

console.log(JSON.stringify({ ok: true, meta }));
await browser.close();
