import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

async function dismiss(page) {
  const btn = page.getByRole("button", { name: "시작하기" });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

async function shot(page, name) {
  const path = `${OUT}/ilbiseo-unified-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await dismiss(page);

  // default should be unified after start
  await page.getByRole("button", { name: /^통합/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("heading", { name: "통합 보기" }).waitFor();
  await page.getByLabel("통합 일정 목록").waitFor();
  await shot(page, "combined-list");

  // week chip
  await page.getByRole("button", { name: "이번 주" }).click();
  await page.waitForTimeout(300);
  await shot(page, "week-filter");

  // prove badges — look inside list
  await page.getByLabel("통합 일정 목록").getByText("할 일", { exact: true }).first().waitFor();
  await page.getByLabel("통합 일정 목록").getByText("캘린더", { exact: true }).first().waitFor();
  await shot(page, "source-badges");

  // workbook still task-only
  await page.getByRole("button", { name: /^할 일/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByText("일비서.xlsx").first().waitFor();
  await shot(page, "workbook-tasks-only");

  // briefing sections
  await page.getByRole("button", { name: /브리핑/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByText("【할 일】").waitFor();
  await page.getByText("【구글 캘린더】").waitFor();
  await shot(page, "briefing-sections");

  await page.close();

  const mobileCtx = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: "networkidle" });
  await dismiss(mobile);
  await mobile.getByRole("button", { name: /통합/ }).first().click();
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
