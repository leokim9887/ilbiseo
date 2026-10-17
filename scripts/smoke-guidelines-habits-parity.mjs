/**
 * Smoke: 지침/습관 blank · drag select · scroll >5 ·
 * 지침/습관 bulk: 완료 왼쪽 · 선택 삭제 오른쪽 (가로, 겹침 없음)
 * 행 단위 「완료」 토글 없음 (선택 체크만)
 * 할 일 bulk: 완료 · 선택 삭제 가로 (세로 스택 아님)
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://127.0.0.1:43145";
const OUT =
  process.env.OUT_DIR ||
  join(
    "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3",
    "media",
  );
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

// --- Blank defaults for 지침 / 습관 ---
const guide = page.locator('[data-side-kind="guideline"]');
const habit = page.locator('[data-side-kind="habit"]');
await guide.scrollIntoViewIfNeeded();
await guide.locator("[data-side-add]").click();
await page.waitForTimeout(200);
const guideTitle = guide.locator('input[aria-label="지침 제목"]').first();
const guideVal = await guideTitle.inputValue();
const guidePh = await guideTitle.getAttribute("placeholder");
const blankGuideOk = guideVal === "" && (guidePh || "").includes("지침");

await habit.scrollIntoViewIfNeeded();
await habit.locator("[data-side-add]").click();
await page.waitForTimeout(200);
const habitTitle = habit.locator('input[aria-label="습관 제목"]').first();
const habitVal = await habitTitle.inputValue();
const habitPh = await habitTitle.getAttribute("placeholder");
const blankHabitOk = habitVal === "" && (habitPh || "").includes("습관");

// Seed 7 guidelines for scroll + paint select; 2 habits for paint + side toolbar
await page.evaluate(() => {
  const now = new Date().toISOString();
  const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
  s.guidelines = Array.from({ length: 7 }, (_, i) => ({
    id: `parity-g${i + 1}`,
    title: `지침스크롤${i + 1}`,
    memo: "",
    done: false,
    createdAt: now,
    completedAt: null,
  }));
  s.habits = Array.from({ length: 2 }, (_, i) => ({
    id: `parity-h${i + 1}`,
    title: `습관페인트${i + 1}`,
    memo: "",
    done: false,
    createdAt: now,
    completedAt: null,
  }));
  localStorage.setItem("ilbiseo-state-v2", JSON.stringify(s));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);

const scrollBox = page.locator('[data-side-list-scroll="guideline"]');
await scrollBox.scrollIntoViewIfNeeded();
const scrollMetrics = await scrollBox.evaluate((el) => ({
  clientHeight: el.clientHeight,
  scrollHeight: el.scrollHeight,
  overflowY: getComputedStyle(el).overflowY,
}));
const scrollOk =
  scrollMetrics.scrollHeight > scrollMetrics.clientHeight + 8 &&
  (scrollMetrics.overflowY === "auto" || scrollMetrics.overflowY === "scroll");

await page.screenshot({
  path: `${OUT}/ilbiseo-guidelines-scroll.png`,
  fullPage: true,
});

// No per-row 「완료」 toggle (aria-label "지침 완료" / "습관 완료")
const rowDoneGuide = await page
  .locator('[data-side-kind="guideline"] input[aria-label="지침 완료"]')
  .count();
const rowDoneHabit = await page
  .locator('[data-side-kind="habit"] input[aria-label="습관 완료"]')
  .count();
const noRowDoneOk = rowDoneGuide === 0 && rowDoneHabit === 0;

// Paint / drag multi-select on checkbox column (habit: 2 items)
const habitScroll = page.locator('[data-side-list-scroll="habit"]');
await habitScroll.scrollIntoViewIfNeeded();
const cell1 = page.locator('[data-side-select-cell="parity-h1"]');
const cell2 = page.locator('[data-side-select-cell="parity-h2"]');
const box1 = await cell1.boundingBox();
const box2 = await cell2.boundingBox();
if (!box1 || !box2) throw new Error("habit select cells missing");
await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
await page.mouse.down();
await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, {
  steps: 16,
});
await page.mouse.up();
await page.waitForTimeout(250);
let selectedHabit = await page
  .locator('[data-side-kind="habit"] [data-side-item-selected="1"]')
  .count();
// Fallback: click each select cell if paint missed one
if (selectedHabit < 2) {
  for (const id of ["parity-h1", "parity-h2"]) {
    const sel = await page
      .locator(`[data-side-kind="habit"] [data-side-item="${id}"]`)
      .getAttribute("data-side-item-selected");
    if (sel === "1") continue;
    const cell = page.locator(`[data-side-select-cell="${id}"]`);
    const b = await cell.boundingBox();
    if (!b) continue;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(150);
  selectedHabit = await page
    .locator('[data-side-kind="habit"] [data-side-item-selected="1"]')
    .count();
}
const paintOk = selectedHabit === 2;
const bulkHabitDelete = await page
  .locator('[data-side-bulk-delete="habit"]')
  .count();
const bulkHabitComplete = await page
  .locator('[data-side-bulk-complete="habit"]')
  .count();
const paintToolbarOk = bulkHabitDelete === 1 && bulkHabitComplete === 1;

// 지침/습관: 완료 왼쪽 · 선택 삭제 오른쪽 (가로, 겹침 없음)
const sideHorizontalOrder = await page.evaluate(() => {
  const wrap = document.querySelector('[data-side-bulk-actions="habit"]');
  if (!wrap) return { ok: false, reason: "no wrap" };
  const kids = [...wrap.querySelectorAll("button")].map((b) =>
    b.getAttribute("data-side-bulk-delete") !== null
      ? "delete"
      : b.getAttribute("data-side-bulk-complete") !== null
        ? "complete"
        : "other",
  );
  const complete = wrap.querySelector("[data-side-bulk-complete]");
  const del = wrap.querySelector("[data-side-bulk-delete]");
  if (!complete || !del) return { ok: false, reason: "missing buttons", kids };
  const cr = complete.getBoundingClientRect();
  const dr = del.getBoundingClientRect();
  const sameRow = Math.abs(cr.top - dr.top) < 12;
  const completeLeft = cr.right <= dr.left + 2;
  const gap = dr.left - cr.right;
  const noOverlap = gap >= 0;
  const notStacked = !(
    Math.abs(cr.left - dr.left) < 24 && dr.top > cr.bottom - 4
  );
  return {
    ok:
      kids[0] === "complete" &&
      kids[1] === "delete" &&
      sameRow &&
      completeLeft &&
      noOverlap &&
      notStacked,
    kids,
    sameRow,
    completeLeft,
    noOverlap,
    gap,
    notStacked,
  };
});

// Mark both habits done via bulk 완료
await page.locator('[data-side-bulk-complete="habit"]').click();
await page.waitForTimeout(300);
const habitDoneAfter = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
  return (s.habits || [])
    .filter((h) => String(h.id).startsWith("parity-h"))
    .map((h) => ({ id: h.id, done: !!h.done }));
});
const sideCompleteOk =
  habitDoneAfter.length === 2 && habitDoneAfter.every((h) => h.done);

await page.screenshot({
  path: `${OUT}/ilbiseo-habits-drag-select.png`,
  fullPage: true,
});

// --- 할 일: 완료 · 선택 삭제 가로 (세로 스택이 아님) ---
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);
await page.getByRole("button", { name: "행 추가" }).first().click();
await page.waitForTimeout(150);
await page
  .locator('textarea[aria-label="할 일"]')
  .first()
  .fill("가로완료-테스트");
await page.locator("input[data-excel-row-check]").first().click({ force: true });
await page.waitForTimeout(200);

const todoHorizontal = await page.evaluate(() => {
  const del = document.querySelector("[data-excel-bulk-delete]");
  const complete = document.querySelector("[data-excel-bulk-complete]");
  if (!del || !complete) return { ok: false, reason: "missing buttons" };
  const dr = del.getBoundingClientRect();
  const cr = complete.getBoundingClientRect();
  const sameRow = Math.abs(dr.top - cr.top) < 12;
  const sideBySide = Math.abs(dr.left - cr.left) > 40;
  const completeLeft = cr.right <= dr.left + 2;
  const notStacked = !(
    Math.abs(dr.left - cr.left) < 24 && dr.top > cr.bottom - 4
  );
  return {
    ok: sameRow && sideBySide && completeLeft && notStacked,
    sameRow,
    sideBySide,
    completeLeft,
    notStacked,
  };
});

await page.screenshot({
  path: `${OUT}/ilbiseo-todo-bulk-horizontal.png`,
  fullPage: false,
});

// Side toolbar: complete left of delete
await page.locator('[data-side-select-cell="parity-g1"]').click({ force: true });
await page.waitForTimeout(150);
await page.screenshot({
  path: `${OUT}/ilbiseo-side-complete-left-of-delete.png`,
  fullPage: false,
});

const summary = {
  blankGuideOk,
  blankHabitOk,
  guideVal,
  habitVal,
  scrollOk,
  scrollMetrics,
  noRowDoneOk,
  rowDoneGuide,
  rowDoneHabit,
  paintOk,
  paintToolbarOk,
  selectedHabit,
  sideHorizontalOrder,
  sideCompleteOk,
  habitDoneAfter,
  todoHorizontal,
};
const allOk =
  blankGuideOk &&
  blankHabitOk &&
  scrollOk &&
  noRowDoneOk &&
  paintOk &&
  paintToolbarOk &&
  sideHorizontalOrder.ok &&
  sideCompleteOk &&
  todoHorizontal.ok;

console.log(JSON.stringify(summary, null, 2));
console.log(allOk ? "PASS" : "FAIL");
await browser.close();
process.exit(allOk ? 0 : 1);
