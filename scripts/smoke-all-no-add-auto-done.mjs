/**
 * Smoke: 「전체」 hides 행 추가; overdue stays in 틀 (bottom + separator), NOT auto→한 일.
 * Manual complete → 한 일 still works.
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
      id: "ok2",
      title: "내일할일",
      category: "work",
      kind: "spot",
      startDate: todayKst,
      targetDate: todayKst,
      urgency: 1,
      importance: 1,
      groupKey: "내일",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-02T00:00:00.000Z",
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

// No auto→한 일 alert
const noAutoDoneAlert = alerts.every((m) => !/한 일/.test(m));

await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(250);

const workTitles = await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .evaluateAll((els) => els.map((e) => e.value));

const pastStillInTodo = workTitles.includes("지난회의준비");
const todayStillThere = workTitles.includes("오늘할일");
const pastIsLast = workTitles[workTitles.length - 1] === "지난회의준비";
const separatorVisible =
  (await page.locator("[data-excel-past-separator]").count()) === 1;
const overdueBadge =
  (await page.locator('[data-excel-overdue="1"]').count()) === 1;
const addRowOnWork = (await page.locator("[data-excel-add-row]").count()) === 1;

await page.screenshot({
  path: `${OUT}/ilbiseo-overdue-stay-틀-pc.png`,
  fullPage: false,
});
await page.screenshot({
  path: `${OUT}/ilbiseo-overdue-separator-pc.png`,
  fullPage: false,
});

await page.locator('select[aria-label="틀"]').selectOption("all");
await page.waitForTimeout(250);
const addRowHiddenOnAll =
  (await page.locator("[data-excel-add-row]").count()) === 0;
const separatorOnAll =
  (await page.locator("[data-excel-past-separator]").count()) === 1;

// 한 일 must NOT have auto-moved past task
await page.getByRole("button", { name: /한 일/ }).first().click();
await page.waitForTimeout(400);
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(250);
const doneTitles = await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .evaluateAll((els) => els.map((e) => e.value));
const pastNotInDone = !doneTitles.includes("지난회의준비");

// Manual complete still works
await page.getByRole("button", { name: /할 일/ }).first().click();
await page.waitForTimeout(300);
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);
await page.locator('[data-excel-row="past1"] [data-excel-select-cell]').click();
await page.waitForTimeout(100);
await page.locator("[data-excel-bulk-complete]").click();
await page.waitForTimeout(400);

const afterCompleteTodo = await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .evaluateAll((els) => els.map((e) => e.value));
const pastGoneAfterManual = !afterCompleteTodo.includes("지난회의준비");

await page.getByRole("button", { name: /한 일/ }).first().click();
await page.waitForTimeout(300);
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);
const afterCompleteDone = await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .evaluateAll((els) => els.map((e) => e.value));
const pastInDoneAfterManual = afterCompleteDone.includes("지난회의준비");

const ok =
  noAutoDoneAlert &&
  pastStillInTodo &&
  todayStillThere &&
  pastIsLast &&
  separatorVisible &&
  overdueBadge &&
  addRowOnWork &&
  addRowHiddenOnAll &&
  separatorOnAll &&
  pastNotInDone &&
  pastGoneAfterManual &&
  pastInDoneAfterManual;

console.log(
  JSON.stringify(
    {
      ok,
      noAutoDoneAlert,
      alerts,
      workTitles,
      pastStillInTodo,
      todayStillThere,
      pastIsLast,
      separatorVisible,
      overdueBadge,
      addRowOnWork,
      addRowHiddenOnAll,
      separatorOnAll,
      pastNotInDone,
      pastGoneAfterManual,
      pastInDoneAfterManual,
      todayKst,
      pastEnd,
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(ok ? 0 : 1);
