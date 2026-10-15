import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
const frames = ["work", "personal", "project", "team"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
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
await page.waitForTimeout(600);

const results = [];
for (const frame of frames) {
  await page.locator('select[aria-label="틀"]').selectOption(frame);
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "행 추가" }).first().click();
  await page.waitForTimeout(350);

  const title = page.locator('textarea[aria-label="할일 LIST UP"]').first();
  await title.click();
  await title.fill(`메모테스트-${frame}`);

  const memo = page.locator('input[aria-label="메모"]').first();
  await memo.click();
  const focused = await memo.evaluate(
    (el) => document.activeElement === el,
  );
  await memo.fill(`메모내용-${frame}`);
  await page.waitForTimeout(150);

  const memoVal = await memo.inputValue();
  const titleVal = await title.inputValue();

  // deadline
  const deadlineBtn = page
    .locator("button")
    .filter({ hasText: "시작 ~ 종료" })
    .first();
  if (await deadlineBtn.count()) {
    await deadlineBtn.click();
    await page.waitForTimeout(200);
    const start = page.locator('input[aria-label="시작일"]').first();
    if (await start.count()) await start.fill("2026-10-08");
    const end = page.locator('input[aria-label="종료일"]').first();
    if (await end.count()) await end.fill("2026-10-10");
  }

  const imp = page.locator('select[aria-label="중요도"]').first();
  if (await imp.count()) await imp.selectOption("3");

  // Persist check BEFORE complete (complete moves row off 할 일 sheet)
  let stored = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
    return (s.tasks || []).map((t) => ({
      title: t.title,
      memo: t.memo,
      category: t.category,
      status: t.status,
      importance: t.importance,
      targetDate: t.targetDate,
    }));
  });
  let hit = stored.find((t) => t.title === `메모테스트-${frame}`);
  const memoPersisted = hit?.memo === `메모내용-${frame}`;

  const done = page
    .locator('input[type="checkbox"][aria-label$="완료여부"]')
    .first();
  if (await done.count()) {
    await done.click({ force: true });
    await page.waitForTimeout(250);
  }

  stored = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
    return (s.tasks || []).map((t) => ({
      title: t.title,
      memo: t.memo,
      category: t.category,
      status: t.status,
      importance: t.importance,
      targetDate: t.targetDate,
    }));
  });
  hit = stored.find((t) => t.title === `메모테스트-${frame}`);
  results.push({
    frame,
    focused,
    titleOk: titleVal === `메모테스트-${frame}`,
    memoInputOk: memoVal === `메모내용-${frame}`,
    memoPersisted,
    completed: hit?.status === "completed",
    importance: hit?.importance,
    targetDate: hit?.targetDate,
  });
}

// Screenshot on personal with a live editable memo row
await page.locator('select[aria-label="틀"]').selectOption("personal");
await page.getByRole("button", { name: "행 추가" }).first().click();
await page.waitForTimeout(300);
await page.locator('textarea[aria-label="할일 LIST UP"]').first().fill("스크린샷용 할일");
const memoShot = page.locator('input[aria-label="메모"]').first();
await memoShot.click();
await memoShot.fill("클릭해서 입력한 메모입니다");
await page.waitForTimeout(300);
await page.screenshot({
  path: `${OUT}/ilbiseo-memo-edit-working.png`,
  fullPage: true,
});
await memoShot.click();
await page.screenshot({
  path: `${OUT}/ilbiseo-memo-edit-focused.png`,
  fullPage: true,
});

const allMemoOk = results.every((r) => r.memoInputOk && r.memoPersisted && r.focused);
console.log(JSON.stringify({ results, allMemoOk }, null, 2));
await browser.close();
if (!allMemoOk) process.exit(1);
