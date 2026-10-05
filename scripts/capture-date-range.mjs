import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

async function dismissWelcome(page) {
  const btn = page.getByRole("button", { name: "시작하기" });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

async function shot(page, name) {
  const path = `${OUT}/ilbiseo-date-range-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}

async function main() {
  const browser = await chromium.launch();
  const desktop = await browser.newPage({
    viewport: { width: 1360, height: 900 },
  });
  await desktop.goto(BASE, { waitUntil: "networkidle" });
  await desktop.evaluate(() => localStorage.clear());
  await desktop.reload({ waitUntil: "networkidle" });
  await dismissWelcome(desktop);

  await desktop.getByRole("button", { name: /^할 일/ }).first().click();
  await desktop.waitForTimeout(400);

  // filter bar visible
  await desktop.getByText("기간", { exact: true }).first().waitFor();
  await desktop.getByRole("button", { name: "이번 주" }).waitFor();
  await shot(desktop, "filter-bar");

  // edit deadline range on first row
  await desktop.getByLabel("마감목표").first().click();
  await desktop.waitForTimeout(200);
  await desktop.getByLabel("시작일").fill("2026-10-01");
  await desktop.getByLabel("종료일").fill("2026-10-15");
  await desktop.waitForTimeout(200);
  await shot(desktop, "edit-range");

  // click outside to collapse edit
  await desktop.getByRole("columnheader", { name: "마감목표" }).click();
  await desktop.waitForTimeout(200);

  await desktop.getByRole("button", { name: "이번 달" }).click();
  await desktop.waitForTimeout(400);
  await shot(desktop, "month-filter");

  await desktop.locator(".excel-wb").screenshot({
    path: `${OUT}/ilbiseo-date-range-grid.png`,
  });
  console.log("wrote", `${OUT}/ilbiseo-date-range-grid.png`);

  await desktop.close();

  const mobileCtx = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: "networkidle" });
  await dismissWelcome(mobile);
  await mobile
    .locator("nav[aria-label='주요 메뉴']")
    .getByRole("button", { name: "할 일" })
    .click();
  await mobile.waitForTimeout(400);
  await shot(mobile, "mobile");
  await mobileCtx.close();
  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
