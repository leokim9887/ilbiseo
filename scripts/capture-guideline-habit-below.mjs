import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 1100 } });
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
  await page.waitForTimeout(700);

  const wb = page.locator(".excel-wb");
  await wb.getByLabel("틀").waitFor();

  const options = await wb.getByLabel("틀").locator("option").allTextContents();
  if (options.some((o) => o.includes("지침") || o.includes("습관"))) {
    throw new Error(`지침/습관 still in 틀: ${options.join(",")}`);
  }
  for (const need of ["업무용", "구글 캘린더"]) {
    if (!options.some((o) => o.includes(need))) {
      throw new Error(`missing frame: ${need}`);
    }
  }

  const guide = page.getByRole("region", { name: "지침" });
  const habit = page.getByRole("region", { name: "습관" });
  await guide.waitFor();
  await habit.waitFor();

  await page.screenshot({
    path: `${OUT}/ilbiseo-guideline-habit-below-empty.png`,
    fullPage: true,
  });

  await guide.getByRole("button", { name: "항목 추가" }).click();
  await page.waitForTimeout(200);
  await guide.getByLabel("지침 제목").fill("매일 브리핑 확인");

  await habit.getByRole("button", { name: "항목 추가" }).click();
  await page.waitForTimeout(200);
  await habit.getByLabel("습관 제목").fill("아침 산책");

  await page.screenshot({
    path: `${OUT}/ilbiseo-guideline-habit-below-filled.png`,
    fullPage: true,
  });

  await guide.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${OUT}/ilbiseo-guideline-habit-below-sections.png`,
    fullPage: false,
  });

  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
