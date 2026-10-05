import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  const start = page.getByRole("button", { name: "시작하기" });
  if (await start.isVisible().catch(() => false)) await start.click();

  await page.getByRole("button", { name: /^할 일/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator(".excel-wb").getByRole("button", { name: "오늘", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText("[캘린더]").first().waitFor({ timeout: 15000 });
  await page.screenshot({
    path: `${OUT}/ilbiseo-sheet-merged-today.png`,
    fullPage: true,
  });

  await page.locator(".excel-wb").screenshot({
    path: `${OUT}/ilbiseo-sheet-merged-grid.png`,
  });

  await page.getByRole("button", { name: /^캘린더/ }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT}/ilbiseo-sheet-merged-calendar-tab.png`,
    fullPage: true,
  });

  await page.close();
  const mobileCtx = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: "networkidle" });
  const mStart = mobile.getByRole("button", { name: "시작하기" });
  if (await mStart.isVisible().catch(() => false)) await mStart.click();
  await mobile.getByRole("button", { name: /할 일/ }).first().click();
  await mobile.waitForTimeout(500);
  await mobile.screenshot({
    path: `${OUT}/ilbiseo-sheet-merged-mobile.png`,
    fullPage: true,
  });
  await mobileCtx.close();
  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
