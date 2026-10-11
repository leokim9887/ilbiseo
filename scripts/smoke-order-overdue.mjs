/**
 * Smoke: stable LIST UP order while typing + overdue mark/lock + start min=today(KST).
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

const seed = {
  version: 3,
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
      createdAt: "2026-10-01T00:00:00.000Z",
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
      createdAt: "2026-10-02T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "a3",
      title: "지난할일",
      category: "work",
      kind: "spot",
      startDate: pastEnd,
      targetDate: pastEnd,
      urgency: 3,
      importance: 3,
      groupKey: "지난",
      memo: "과거",
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

const titlesBefore = await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .evaluateAll((els) => els.map((e) => e.value));

// Type into first row title heavily — order must stay
const first = page.locator('textarea[aria-label="할일 LIST UP"]').first();
await first.click();
await first.fill("첫번째-타이핑중-가나다라마바사");
await page.waitForTimeout(200);

const titlesAfter = await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .evaluateAll((els) => els.map((e) => e.value));

const orderStable =
  titlesAfter[0].startsWith("첫번째") &&
  titlesAfter[1] === "두번째" &&
  titlesAfter[2] === "지난할일" &&
  titlesBefore.length === 3;

const overdueRow = page.locator('tr[data-excel-overdue="1"]');
const overdueCount = await overdueRow.count();
const badge = await page.locator("[data-excel-overdue-badge]").count();
const overdueTitleDisabled = await overdueRow
  .locator('textarea[aria-label="할일 LIST UP"]')
  .evaluate((el) => el.disabled || el.readOnly);

// Select only overdue → 선택 삭제 hidden, 완료 visible
await overdueRow.locator('input[data-excel-row-check]').check();
await page.waitForTimeout(150);
const deleteVisible = await page.locator("[data-excel-bulk-delete]").count();
const completeVisible = await page.locator("[data-excel-bulk-complete]").count();

// Open a non-overdue deadline and check start min
await page.locator('tr[data-excel-overdue="0"]').first().locator('button[aria-label="마감목표"]').click();
await page.waitForTimeout(150);
const startMin = await page
  .locator('input[aria-label="시작일"]')
  .first()
  .getAttribute("min");

await page.screenshot({
  path: `${OUT}/ilbiseo-order-overdue-dense.png`,
  fullPage: false,
});

const ok =
  orderStable &&
  overdueCount === 1 &&
  badge >= 1 &&
  overdueTitleDisabled &&
  deleteVisible === 0 &&
  completeVisible === 1 &&
  startMin === todayKst;

console.log(
  JSON.stringify(
    {
      ok,
      orderStable,
      titlesBefore,
      titlesAfter,
      overdueCount,
      badge,
      overdueTitleDisabled,
      deleteVisible,
      completeVisible,
      startMin,
      todayKst,
      pastEnd,
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(ok ? 0 : 1);
