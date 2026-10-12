/**
 * Smoke: 「전체」 hides 행 추가; overdue active tasks auto-move to 한 일 + alert.
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

const alerts = [];
page.on("dialog", async (dialog) => {
  alerts.push(dialog.message());
  await dialog.accept();
});

const seed = {
  version: 3,
  tasks: [
    {
      id: "ok1",
      title: "오늘할일",
      category: "work",
      kind: "spot",
      startDate: todayKst,
      targetDate: todayKst,
      urgency: 2,
      importance: 2,
      groupKey: "오늘",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "past1",
      title: "지난회의준비",
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
    {
      id: "someday1",
      title: "언젠가정리",
      category: "personal",
      kind: "someday",
      startDate: null,
      targetDate: null,
      urgency: 1,
      importance: 1,
      groupKey: "언젠가",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-09-02T00:00:00.000Z",
      completedAt: null,
    },
  ],
  checklists: [],
  calendarEvents: [],
  guidelines: [],
  habits: [],
};

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate((s) => {
  localStorage.clear();
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
  localStorage.setItem("ilbiseo-state-v2", JSON.stringify(s));
}, seed);
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// Alert should have fired for overdue auto-complete
const alertOk =
  alerts.length >= 1 &&
  /한 일/.test(alerts[0]) &&
  /지난회의준비/.test(alerts[0]) &&
  /1건/.test(alerts[0]);

await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(250);

const workTitles = await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .evaluateAll((els) => els.map((e) => e.value));

const pastGoneFromTodo = !workTitles.includes("지난회의준비");
const todayStillThere = workTitles.includes("오늘할일");
const noOverdueBadge = (await page.locator("[data-excel-overdue-badge]").count()) === 0;
const addRowOnWork = (await page.locator("[data-excel-add-row]").count()) === 1;

await page.locator('select[aria-label="틀"]').selectOption("all");
await page.waitForTimeout(250);
const addRowHiddenOnAll =
  (await page.locator("[data-excel-add-row]").count()) === 0;

// 한 일 sheet should have the auto-moved task
await page.getByRole("button", { name: /한 일/ }).first().click();
await page.waitForTimeout(400);
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(250);
const doneTitles = await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .evaluateAll((els) => els.map((e) => e.value));
const pastInDone = doneTitles.includes("지난회의준비");

// Reload — no second alert spam for same completed ids
const alertCountBeforeReload = alerts.length;
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const noSpamOnReload = alerts.length === alertCountBeforeReload;

await page.screenshot({
  path: `${OUT}/ilbiseo-all-no-add-auto-done.png`,
  fullPage: false,
});

const ok =
  alertOk &&
  pastGoneFromTodo &&
  todayStillThere &&
  noOverdueBadge &&
  addRowOnWork &&
  addRowHiddenOnAll &&
  pastInDone &&
  noSpamOnReload;

console.log(
  JSON.stringify(
    {
      ok,
      alertOk,
      alerts,
      workTitles,
      pastGoneFromTodo,
      todayStillThere,
      noOverdueBadge,
      addRowOnWork,
      addRowHiddenOnAll,
      pastInDone,
      noSpamOnReload,
      todayKst,
      pastEnd,
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(ok ? 0 : 1);
