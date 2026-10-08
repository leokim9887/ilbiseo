import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4347";
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

  // Add 3 rows, then name each by visible row index
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
    await titlesLoc.nth(i).fill(`일괄삭제-${frame}-${i + 1}`);
  }
  await page.waitForTimeout(250);

  // Select first two via row checkboxes
  const checks = page.locator("input[data-excel-row-check]");
  const n = await checks.count();
  if (n < 2) throw new Error(`${frame}: expected >=2 row checks, got ${n}`);
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.waitForTimeout(150);

  const countText = await page
    .locator("[data-excel-selection-count]")
    .innerText();
  const countOk = countText.includes("2개 선택");

  const beforeTitles = [];
  for (let i = 0; i < 3; i++) {
    beforeTitles.push(await titlesLoc.nth(i).inputValue());
  }
  const keepTitle = beforeTitles[2];

  await page.locator("[data-excel-bulk-delete]").click();
  await page.waitForTimeout(200);
  await page.locator("[data-excel-confirm-delete]").click();
  await page.waitForTimeout(400);

  const stored = await page.evaluate((f) => {
    const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
    return (s.tasks || []).filter(
      (t) => t.category === f && t.status === "active",
    );
  }, frame);

  const titles = stored.map((t) => t.title).sort();
  const remainingOk = titles.length === 1 && titles[0] === keepTitle;
  const selectionCleared =
    (await page.locator("[data-excel-selection-count]").count()) === 0;

  frameResults.push({
    frame,
    countOk,
    remainingOk,
    remaining: titles,
    selectionCleared,
  });
}

// Select-all + clear on personal
await page.locator('select[aria-label="틀"]').selectOption("personal");
await page.waitForTimeout(200);
for (let i = 1; i <= 2; i++) {
  await page.getByRole("button", { name: "행 추가" }).first().click();
  await page.waitForTimeout(100);
  await page
    .locator('textarea[aria-label="할일 LIST UP"]')
    .first()
    .fill(`전체선택-${i}`);
}
await page.locator("[data-excel-select-all]").click();
await page.waitForTimeout(150);
const allCount = await page.locator("[data-excel-selection-count]").innerText();
await page.screenshot({
  path: `${OUT}/ilbiseo-bulk-delete-selected.png`,
  fullPage: true,
});
await page.locator("[data-excel-clear-selection]").click();
await page.waitForTimeout(100);
const cleared =
  (await page.locator("[data-excel-selection-count]").count()) === 0;

// Re-select all and open confirm dialog for screenshot
await page.locator("[data-excel-header-select]").check();
await page.waitForTimeout(100);
await page.locator("[data-excel-bulk-delete]").click();
await page.waitForTimeout(250);
await page.screenshot({
  path: `${OUT}/ilbiseo-bulk-delete-confirm.png`,
  fullPage: true,
});
await page.getByRole("button", { name: "취소" }).click();
await page.waitForTimeout(100);

// Guidelines / habits multi-delete
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
  const now = new Date().toISOString();
  s.guidelines = [
    {
      id: "g1",
      title: "지침A",
      memo: "",
      done: false,
      createdAt: now,
      completedAt: null,
    },
    {
      id: "g2",
      title: "지침B",
      memo: "",
      done: false,
      createdAt: now,
      completedAt: null,
    },
    {
      id: "g3",
      title: "지침C",
      memo: "",
      done: false,
      createdAt: now,
      completedAt: null,
    },
  ];
  s.habits = [
    {
      id: "h1",
      title: "습관A",
      memo: "",
      done: false,
      createdAt: now,
      completedAt: null,
    },
    {
      id: "h2",
      title: "습관B",
      memo: "",
      done: false,
      createdAt: now,
      completedAt: null,
    },
  ];
  localStorage.setItem("ilbiseo-state-v2", JSON.stringify(s));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);

await page.locator('[data-side-row-check="g1"]').check();
await page.locator('[data-side-row-check="g2"]').check();
await page.locator('[data-side-bulk-delete="guideline"]').click();
await page.waitForTimeout(150);
await page.locator('[data-side-confirm-delete="guideline"]').click();
await page.waitForTimeout(300);

await page.locator('[data-side-select-all="habit"]').check();
await page.locator('[data-side-bulk-delete="habit"]').click();
await page.waitForTimeout(150);
await page.locator('[data-side-confirm-delete="habit"]').click();
await page.waitForTimeout(300);

const side = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
  return {
    guidelines: (s.guidelines || []).map((g) => g.title),
    habits: (s.habits || []).map((h) => h.title),
  };
});

await page.screenshot({
  path: `${OUT}/ilbiseo-bulk-delete-after.png`,
  fullPage: true,
});

// GCal: no row checkboxes
await page.locator('select[aria-label="틀"]').selectOption("gcal");
await page.waitForTimeout(300);
const gcalChecks = await page.locator("input[data-excel-row-check]").count();
const gcalBulk = await page.locator("[data-excel-bulk-delete]").count();

const summary = {
  frames: frameResults,
  selectAllOk: allCount.includes("선택"),
  clearOk: cleared,
  guidelinesOk: side.guidelines.length === 1 && side.guidelines[0] === "지침C",
  habitsOk: side.habits.length === 0,
  gcalNoSelect: gcalChecks === 0 && gcalBulk === 0,
  side,
};
const allOk =
  frameResults.every((r) => r.countOk && r.remainingOk && r.selectionCleared) &&
  summary.clearOk &&
  summary.guidelinesOk &&
  summary.habitsOk &&
  summary.gcalNoSelect;

console.log(JSON.stringify({ allOk, ...summary }, null, 2));
await browser.close();
if (!allOk) process.exit(1);
