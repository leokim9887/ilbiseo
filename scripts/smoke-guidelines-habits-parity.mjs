/**
 * Smoke: 지침/습관 blank default · drag multi-select · scroll >5 ·
 * 할 일 bulk toolbar 완료 below 선택 삭제
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

// Seed 7 guidelines for scroll + paint select
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
  steps: 8,
});
await page.mouse.up();
await page.waitForTimeout(200);
const selectedHabit = await page.locator(
  '[data-side-kind="habit"] [data-side-item-selected="1"]',
).count();
const paintOk = selectedHabit === 2;
const bulkHabit = await page.locator('[data-side-bulk-delete="habit"]').count();
const paintToolbarOk = bulkHabit === 1;

await page.screenshot({
  path: `${OUT}/ilbiseo-habits-drag-select.png`,
  fullPage: true,
});

// --- 할 일: 완료 below 선택 삭제 ---
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);
await page.getByRole("button", { name: "행 추가" }).first().click();
await page.waitForTimeout(150);
await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .first()
  .fill("스택완료-테스트");
await page.locator("input[data-excel-row-check]").first().click({ force: true });
await page.waitForTimeout(200);

const stackOrder = await page.evaluate(() => {
  const wrap = document.querySelector("[data-excel-bulk-actions]");
  if (!wrap) return { ok: false, reason: "no wrap" };
  const kids = [...wrap.querySelectorAll("button")].map((b) =>
    (b.getAttribute("data-excel-bulk-delete") !== null
      ? "delete"
      : b.getAttribute("data-excel-bulk-complete") !== null
        ? "complete"
        : b.getAttribute("data-excel-bulk-restore") !== null
          ? "restore"
          : "other"),
  );
  const rects = [...wrap.querySelectorAll("button")].map((b) =>
    b.getBoundingClientRect(),
  );
  const stacked =
    rects.length >= 2 &&
    Math.abs(rects[0].left - rects[1].left) < 24 &&
    rects[1].top > rects[0].bottom - 4;
  return {
    ok: kids[0] === "delete" && kids[1] === "complete" && stacked,
    kids,
    stacked,
  };
});

await page.screenshot({
  path: `${OUT}/ilbiseo-bulk-complete-below-delete.png`,
  fullPage: false,
});

const summary = {
  blankGuideOk,
  blankHabitOk,
  guideVal,
  habitVal,
  scrollOk,
  scrollMetrics,
  paintOk,
  paintToolbarOk,
  selectedHabit,
  stackOrder,
};
const allOk =
  blankGuideOk &&
  blankHabitOk &&
  scrollOk &&
  paintOk &&
  paintToolbarOk &&
  stackOrder.ok;

console.log(JSON.stringify(summary, null, 2));
console.log(allOk ? "PASS" : "FAIL");
await browser.close();
process.exit(allOk ? 0 : 1);
