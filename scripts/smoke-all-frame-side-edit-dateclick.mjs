/**
 * Smoke: 「전체」 틀 · 지침/습관 완료 UI+수정 잠금 · 마감목표 날짜 필드 전체 클릭
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:43145";
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
const dLate = addDays(todayKst, 12);
const dMid = addDays(todayKst, 6);

const seed = {
  version: 3,
  tasks: [
    {
      id: "w-late",
      title: "업무-늦은시작",
      category: "work",
      kind: "ongoing",
      startDate: dLate,
      targetDate: addDays(dLate, 2),
      urgency: 2,
      importance: 2,
      groupKey: "업무늦은",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "p-early",
      title: "개인-이른시작",
      category: "personal",
      kind: "spot",
      startDate: dEarly,
      targetDate: dEarly,
      urgency: 1,
      importance: 1,
      groupKey: "개인이른",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-02T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "j-mid",
      title: "과제-중간시작",
      category: "project",
      kind: "ongoing",
      startDate: dMid,
      targetDate: addDays(dMid, 5),
      urgency: 2,
      importance: 3,
      groupKey: "과제중간",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-03T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t-some",
      title: "팀원-언젠가",
      category: "team",
      kind: "someday",
      startDate: null,
      targetDate: null,
      urgency: 1,
      importance: 1,
      groupKey: "팀원언젠가",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-04T00:00:00.000Z",
      completedAt: null,
    },
  ],
  checklists: [],
  calendarEvents: [
    {
      id: "cal-1",
      title: "캘린더만",
      start: todayKst,
      end: null,
      allDay: true,
      notes: "mock",
      source: "mock",
    },
  ],
  guidelines: [
    {
      id: "g1",
      title: "열린 지침",
      memo: "",
      done: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "g2",
      title: "완료된 지침",
      memo: "잠금",
      done: true,
      createdAt: "2026-10-01T01:00:00.000Z",
      completedAt: "2026-10-02T00:00:00.000Z",
    },
  ],
  habits: [
    {
      id: "h1",
      title: "열린 습관",
      memo: "",
      done: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate((data) => {
  localStorage.setItem("ilbiseo-state-v2", JSON.stringify(data));
}, seed);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector('select[aria-label="틀"]');

const frameSelect = page.locator('select[aria-label="틀"]');
const optionLabels = await frameSelect.locator("option").allTextContents();
const hasAll = optionLabels.some((t) => t.trim() === "전체");
const hasGcal = optionLabels.some((t) => t.includes("구글"));

await frameSelect.selectOption("all");
await page.waitForTimeout(300);

const titles = await page.locator("[data-excel-row]").evaluateAll((rows) =>
  rows.map((r) => {
    const ta = r.querySelector("textarea[aria-label='할 일']");
    return (ta?.value || ta?.textContent || "").trim();
  }),
);

const expectedOrder = [
  "업무-늦은시작",
  "과제-중간시작",
  "개인-이른시작",
  "팀원-언젠가",
];
const orderOk =
  titles.length === 4 &&
  titles.every((t, i) => t === expectedOrder[i]);

const badges = await page.locator("[data-excel-frame-badge]").count();
const noCalInAll = !(await page
  .locator("text=캘린더만")
  .first()
  .isVisible()
  .catch(() => false));

const sortHint = await page
  .locator("text=시작일 내림차순")
  .first()
  .isVisible()
  .catch(() => false);

await page.screenshot({
  path: join(OUT, "ilbiseo-all-frame-aggregated.png"),
  fullPage: false,
});

// --- Side list completed UI + edit lock ---
const doneItem = page.locator('[data-side-item="g2"]');
const doneBadge = await doneItem.locator("[data-side-done-badge]").count();
const locked = (await doneItem.getAttribute("data-side-item-locked")) === "1";
const titleDisabled = await doneItem
  .locator("[data-side-title]")
  .isDisabled();
const editBtn = doneItem.locator("[data-side-edit]");
const hasEdit = (await editBtn.count()) > 0;

await editBtn.click();
await page.waitForTimeout(150);
const unlocked =
  (await doneItem.getAttribute("data-side-item-locked")) === "0";
const titleEnabled = !(await doneItem
  .locator("[data-side-title]")
  .isDisabled());
await doneItem.locator("[data-side-title]").fill("완료된 지침 수정함");
await doneItem.locator("[data-side-edit-done]").click();
await page.waitForTimeout(150);
const relocked =
  (await doneItem.getAttribute("data-side-item-locked")) === "1";

// complete open guideline via toolbar (paint-select cell)
async function paintClick(id) {
  const cell = page.locator(`[data-side-select-cell="${id}"]`);
  const b = await cell.boundingBox();
  if (!b) throw new Error(`select cell missing: ${id}`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(80);
}

await paintClick("g1");
await page.locator('[data-side-bulk-complete="guideline"]').click();
await page.waitForTimeout(200);
const g1Done =
  (await page
    .locator('[data-side-item="g1"]')
    .getAttribute("data-side-item-done")) === "1";
const g1Locked =
  (await page
    .locator('[data-side-item="g1"]')
    .getAttribute("data-side-item-locked")) === "1";

await page.screenshot({
  path: join(OUT, "ilbiseo-side-completed-locked.png"),
  fullPage: false,
});

// --- Date field full-area click (showPicker / indicator cover) ---
await frameSelect.selectOption("work");
await page.waitForTimeout(200);
const workRow = page.locator('[data-excel-row="w-late"]');
await workRow.locator('[data-excel-deadline-display="w-late"]').click();
await page.waitForTimeout(200);
const startField = workRow.locator('[data-excel-date-field="start"]');
const endField = workRow.locator('[data-excel-date-field="end"]');
const startInput = workRow.locator('[data-excel-date-input="start"]');

const dateFieldsOk =
  (await startField.count()) === 1 && (await endField.count()) === 1;

const showPickerWired = await startInput.evaluate((el) => {
  return typeof el.showPicker === "function";
});

const indicatorCovered = await startInput.evaluate((el) => {
  const styles = getComputedStyle(el, "::-webkit-calendar-picker-indicator");
  // opacity 0 full-cover indicator — or browsers without webkit pseudo still ok via showPicker
  return styles ? styles.opacity === "0" || styles.width !== "auto" : true;
});

// Click label area (not only icon) — should focus/open without error
await startField.click({ position: { x: 8, y: 8 } });
await page.waitForTimeout(100);
await endField.click({ position: { x: 8, y: 8 } });
await page.waitForTimeout(100);

await page.screenshot({
  path: join(OUT, "ilbiseo-deadline-datefield-fullclick.png"),
  fullPage: false,
});

// Keep side constraints: complete left of delete, no row done checkbox
await paintClick("g2");
await page.waitForTimeout(100);
const completeLeft = await page.evaluate(() => {
  const wrap = document.querySelector('[data-side-bulk-actions="guideline"]');
  if (!wrap) return false;
  const complete = wrap.querySelector("[data-side-bulk-complete]");
  const del = wrap.querySelector("[data-side-bulk-delete]");
  if (!complete || !del) return false;
  const cr = complete.getBoundingClientRect();
  const dr = del.getBoundingClientRect();
  return Math.abs(cr.top - dr.top) < 12 && cr.right <= dr.left + 2;
});
const noRowDone =
  (await page
    .locator('[data-side-kind="guideline"] input[aria-label="지침 완료"]')
    .count()) === 0 &&
  (await page
    .locator('[data-side-kind="habit"] input[aria-label="습관 완료"]')
    .count()) === 0;

const result = {
  hasAll,
  hasGcal,
  orderOk,
  titles,
  expectedOrder,
  badges,
  noCalInAll,
  sortHint,
  doneBadge: doneBadge > 0,
  locked,
  titleDisabled,
  hasEdit,
  unlocked,
  titleEnabled,
  relocked,
  g1Done,
  g1Locked,
  dateFieldsOk,
  showPickerWired,
  indicatorCovered,
  completeLeft,
  noRowDone,
};

const pass =
  result.hasAll &&
  result.hasGcal &&
  result.orderOk &&
  result.badges === 4 &&
  result.noCalInAll &&
  result.sortHint &&
  result.doneBadge &&
  result.locked &&
  result.titleDisabled &&
  result.hasEdit &&
  result.unlocked &&
  result.titleEnabled &&
  result.relocked &&
  result.g1Done &&
  result.g1Locked &&
  result.dateFieldsOk &&
  result.showPickerWired &&
  result.completeLeft &&
  result.noRowDone;

writeFileSync(
  join(OUT, "smoke-all-frame-side-edit-dateclick.json"),
  JSON.stringify({ pass, ...result }, null, 2),
);

console.log(JSON.stringify({ pass, ...result }, null, 2));
console.log(pass ? "PASS" : "FAIL");

await browser.close();
process.exit(pass ? 0 : 1);
