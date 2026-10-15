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
  const path = `${OUT}/ilbiseo-priority-max3-${name}.png`;
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

  await desktop.getByLabel("중요도").first().selectOption("3");
  await shot(desktop, "desktop");

  // open select options visible via native select — capture grid focus
  await desktop.locator(".excel-wb").screenshot({
    path: `${OUT}/ilbiseo-priority-max3-grid.png`,
  });
  console.log("wrote", `${OUT}/ilbiseo-priority-max3-grid.png`);

  // verify max option is 3
  const opts = await desktop.getByLabel("중요도").first().locator("option").allTextContents();
  if (!opts.includes("3") || opts.includes("4") || opts.includes("5")) {
    throw new Error(`unexpected importance options: ${opts.join(",")}`);
  }

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
