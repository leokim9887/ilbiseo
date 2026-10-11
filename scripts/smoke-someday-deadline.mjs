/**
 * Smoke: 「언젠가」 chip, start-date deadline sort, someday always last,
 * not overdue, denser rows still editable.
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

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const dEarly = addDays(todayKst, 2);
const dLate = addDays(todayKst, 10);
const dMid = addDays(todayKst, 5);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

const seed = {
  version: 3,
  tasks: [
    {
      id: "late",
      title: "늦은시작",
      category: "work",
      kind: "ongoing",
      startDate: dLate,
      targetDate: addDays(dLate, 3),
      urgency: 2,
      importance: 2,
      groupKey: "늦은",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "early",
      title: "이른시작",
      category: "work",
      kind: "ongoing",
      startDate: dEarly,
      targetDate: addDays(dEarly, 20),
      urgency: 2,
      importance: 2,
      groupKey: "이른",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-02T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "mid",
      title: "중간시작",
      category: "work",
      kind: "spot",
      startDate: dMid,
      targetDate: dMid,
      urgency: 1,
      importance: 1,
      groupKey: "중간",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-03T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "some",
      title: "언젠가할일",
      category: "work",
      kind: "someday",
      startDate: null,
      targetDate: null,
      urgency: 3,
      importance: 3,
      groupKey: "언젠가",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-04T00:00:00.000Z",
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
await page.waitForTimeout(500);

await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(300);

// Collapsed 언젠가 display
const somedayLabel = await page
  .locator('[data-excel-deadline-display="some"]')
  .innerText();
if (!somedayLabel.includes("언젠가")) {
  throw new Error(`expected 언젠가 display, got: ${somedayLabel}`);
}

// Not overdue
const overdueCount = await page.locator('[data-excel-overdue="1"]').count();
if (overdueCount !== 0) {
  throw new Error(`someday must not be overdue, got ${overdueCount}`);
}

// Sort ASC by 마감목표 → start dates: early, mid, late, someday last
await page.getByRole("button", { name: /마감목표/ }).click();
await page.waitForTimeout(250);
let titles = await page.locator("[data-excel-row]").evaluateAll((rows) =>
  rows.map((r) => {
    const ta = r.querySelector("textarea");
    return ta ? ta.value : "";
  }),
);
const expectedAsc = ["이른시작", "중간시작", "늦은시작", "언젠가할일"];
if (JSON.stringify(titles) !== JSON.stringify(expectedAsc)) {
  throw new Error(`ASC sort by start failed: ${JSON.stringify(titles)}`);
}

// Sort DESC → late, mid, early, someday still last
await page.getByRole("button", { name: /마감목표/ }).click();
await page.waitForTimeout(250);
titles = await page.locator("[data-excel-row]").evaluateAll((rows) =>
  rows.map((r) => {
    const ta = r.querySelector("textarea");
    return ta ? ta.value : "";
  }),
);
const expectedDesc = ["늦은시작", "중간시작", "이른시작", "언젠가할일"];
if (JSON.stringify(titles) !== JSON.stringify(expectedDesc)) {
  throw new Error(`DESC sort someday-last failed: ${JSON.stringify(titles)}`);
}

// Toggle 언젠가 on mid row
await page.locator('[data-excel-deadline-display="mid"]').click();
await page.waitForTimeout(150);
await page.locator('[data-excel-someday="mid"]').click();
await page.waitForTimeout(200);
const midState = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2"));
  return s.tasks.find((t) => t.id === "mid");
});
if (
  midState.kind !== "someday" ||
  midState.startDate !== null ||
  midState.targetDate !== null
) {
  throw new Error(`toggle someday failed: ${JSON.stringify(midState)}`);
}

await page.locator('[data-excel-someday="mid"]').click();
await page.waitForTimeout(200);
const midBack = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2"));
  return s.tasks.find((t) => t.id === "mid");
});
if (
  midBack.kind === "someday" ||
  midBack.startDate !== todayKst ||
  midBack.targetDate !== todayKst
) {
  throw new Error(`clear someday failed: ${JSON.stringify(midBack)}`);
}

// start min still today
await page.locator(`[data-excel-cell="mid:deadline"]`).waitFor();
const minAttr = await page
  .locator(`[data-excel-cell="mid:deadline"]`)
  .getAttribute("min");
if (minAttr !== todayKst) {
  throw new Error(`start min expected ${todayKst}, got ${minAttr}`);
}

await page.screenshot({
  path: `${OUT}/ilbiseo-someday-deadline-sort.png`,
  fullPage: false,
});
console.log("OK someday-deadline-sort", {
  todayKst,
  expectedAsc,
  expectedDesc,
  shot: `${OUT}/ilbiseo-someday-deadline-sort.png`,
});
await browser.close();
