import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem(
      "ilbiseo-state-v2",
      JSON.stringify({
        version: 2,
        tasks: [],
        checklists: [],
        calendarEvents: [],
      }),
    );
  });
  await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const wb = page.locator(".excel-wb");
  await wb.getByLabel("틀").waitFor();

  const options = await wb.getByLabel("틀").locator("option").allTextContents();
  for (const need of ["지침", "습관", "구글 캘린더", "업무용"]) {
    if (!options.some((o) => o.includes(need))) {
      throw new Error(`missing frame option: ${need} in ${options.join(",")}`);
    }
  }

  await wb.getByLabel("틀").selectOption("guideline");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${OUT}/ilbiseo-frame-guideline-habit-guideline.png`,
    fullPage: true,
  });
  await wb.screenshot({
    path: `${OUT}/ilbiseo-frame-guideline-habit-guideline-sheet.png`,
  });

  await wb.locator(".bg-\\[\\#f0f2f4\\]").getByRole("button", { name: "행 추가" }).click();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `${OUT}/ilbiseo-frame-guideline-habit-guideline-row.png`,
    fullPage: true,
  });

  await wb.getByLabel("틀").selectOption("habit");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${OUT}/ilbiseo-frame-guideline-habit-habit.png`,
    fullPage: true,
  });
  await wb.screenshot({
    path: `${OUT}/ilbiseo-frame-guideline-habit-habit-sheet.png`,
  });

  await wb.locator('button[data-slot="button"]').filter({ hasText: "행 추가" }).first().click();
  await page.waitForTimeout(200);

  // 한 일 sheet still filters by frame
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: /^한 일/ }).click();
  await page.waitForTimeout(300);
  await wb.getByLabel("틀").selectOption("habit");
  await page.screenshot({
    path: `${OUT}/ilbiseo-frame-guideline-habit-done.png`,
    fullPage: true,
  });

  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
