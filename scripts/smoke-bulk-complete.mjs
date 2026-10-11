import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE_URL || "http://localhost:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
const frames = ["work", "personal", "project", "team"];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
  localStorage.setItem("ilbiseo-install-dismissed-v1", "1");
  localStorage.setItem(
    "ilbiseo-state-v2",
    JSON.stringify({
      version: 3,
      tasks: [],
      checklists: [],
      calendarEvents: [],
      guidelines: [],
      habits: [],
    }),
  );
});
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const frameResults = [];

for (const frame of frames) {
  await page.locator('select[aria-label="틀"]').selectOption(frame);
  await page.waitForTimeout(200);

  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "행 추가" }).first().click();
    await page.waitForTimeout(100);
  }
  const titlesLoc = page.locator('textarea[aria-label="할일 LIST UP"]');
  await page.waitForTimeout(150);
  const rowCount = await titlesLoc.count();
  if (rowCount < 3)
    throw new Error(`${frame}: expected >=3 titles, got ${rowCount}`);
  for (let i = 0; i < 3; i++) {
    await titlesLoc.nth(i).fill(`일괄완료-${frame}-${i + 1}`);
  }
  await page.waitForTimeout(250);

  const checks = page.locator("input[data-excel-row-check]");
  const n = await checks.count();
  if (n < 2) throw new Error(`${frame}: expected >=2 row checks, got ${n}`);
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.waitForTimeout(150);

  const completeBtn = page.locator("[data-excel-bulk-complete]");
  const deleteBtn = page.locator("[data-excel-bulk-delete]");
  const toolbarOk =
    (await completeBtn.count()) === 1 && (await deleteBtn.count()) === 1;

  const keepTitle = await titlesLoc.nth(2).inputValue();

  await completeBtn.click();
  await page.waitForTimeout(400);

  const stored = await page.evaluate((f) => {
    const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
    const tasks = s.tasks || [];
    return {
      active: tasks
        .filter((t) => t.category === f && t.status === "active")
        .map((t) => t.title)
        .sort(),
      completed: tasks
        .filter((t) => t.category === f && t.status === "completed")
        .map((t) => t.title)
        .sort(),
    };
  }, frame);

  const remainingOk =
    stored.active.length === 1 && stored.active[0] === keepTitle;
  const completedOk =
    stored.completed.length === 2 &&
    stored.completed.every((t) => t.startsWith(`일괄완료-${frame}-`));
  const selectionCleared =
    (await page.locator("[data-excel-bulk-complete]").count()) === 0;

  frameResults.push({
    frame,
    toolbarOk,
    remainingOk,
    completedOk,
    selectionCleared,
    active: stored.active,
    completed: stored.completed,
  });
}

// Done sheet: restore still present, no bulk complete
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.getByRole("button", { name: "한 일", exact: true }).click();
await page.waitForTimeout(400);

const doneChecks = page.locator("input[data-excel-row-check]");
const doneCheckCount = await doneChecks.count();
let doneSheetOk = doneCheckCount > 0;
if (doneCheckCount > 0) {
  await doneChecks.nth(0).check();
  await page.waitForTimeout(150);
  const noComplete =
    (await page.locator("[data-excel-bulk-complete]").count()) === 0;
  const hasDelete =
    (await page.locator("[data-excel-bulk-delete]").count()) === 1;
  const hasRestore =
    (await page.locator("[data-excel-bulk-restore]").count()) === 1;
  doneSheetOk = noComplete && hasDelete && hasRestore;
}

await page.screenshot({
  path: `${OUT}/ilbiseo-bulk-complete-todo.png`,
  fullPage: true,
});

// Back to todo for screenshot of toolbar
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.locator('select[aria-label="틀"]').selectOption("personal");
await page.waitForTimeout(200);
await page.getByRole("button", { name: "행 추가" }).first().click();
await page.waitForTimeout(150);
await page
  .locator('textarea[aria-label="할일 LIST UP"]')
  .first()
  .fill("완료버튼-스크린샷");
await page.locator("input[data-excel-row-check]").first().check();
await page.waitForTimeout(150);
await page.screenshot({
  path: `${OUT}/ilbiseo-bulk-complete-toolbar.png`,
  fullPage: true,
});

// GCal: no bulk complete
await page.locator('select[aria-label="틀"]').selectOption("gcal");
await page.waitForTimeout(300);
const gcalOk =
  (await page.locator("input[data-excel-row-check]").count()) === 0 &&
  (await page.locator("[data-excel-bulk-complete]").count()) === 0 &&
  (await page.locator("[data-excel-bulk-delete]").count()) === 0;

// Side lists stay delete-only (no bulk complete)
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);
const sideBulkComplete =
  (await page.locator("[data-side-bulk-complete]").count()) === 0;

const summary = {
  frames: frameResults,
  doneSheetOk,
  gcalOk,
  sideDeleteOnly: sideBulkComplete,
};
const allOk =
  frameResults.every(
    (r) =>
      r.toolbarOk && r.remainingOk && r.completedOk && r.selectionCleared,
  ) &&
  doneSheetOk &&
  gcalOk &&
  sideBulkComplete;

console.log(JSON.stringify({ allOk, ...summary }, null, 2));
await browser.close();
if (!allOk) process.exit(1);
