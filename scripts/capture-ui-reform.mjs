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
  const path = `${OUT}/ilbiseo-ui-reform-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}

async function goNav(page, label) {
  await page
    .locator("nav.hidden.sm\\:grid, nav[aria-label='주요 메뉴']")
    .first()
    .getByRole("button", { name: new RegExp(`^${label}`) })
    .click();
  await page.waitForTimeout(400);
}

async function smoke(page) {
  await dismissWelcome(page);
  await goNav(page, "할 일");
  await page.getByRole("heading", { name: /할 일/ }).waitFor({ timeout: 5000 });

  await page.getByRole("button", { name: "항목 추가" }).click();
  await page.waitForTimeout(250);
  await page.getByLabel("할 일 제목").first().fill("UI개편 스모크 항목");
  await page.waitForTimeout(250);

  await page.getByLabel(/완료 → 한 일로 이동/).first().click();
  await page.waitForTimeout(350);
  await goNav(page, "한 일");
  await page.getByText("UI개편 스모크 항목").waitFor({ timeout: 5000 });

  await goNav(page, "체크리스트");
  await page.getByPlaceholder("체크 항목 적기").fill("체크 스모크");
  await page.getByRole("button", { name: "추가" }).click();
  await page.getByText("체크 스모크").waitFor({ timeout: 5000 });
  await page
    .locator("li")
    .filter({ hasText: "체크 스모크" })
    .getByRole("checkbox")
    .click();
  await page.waitForTimeout(200);

  await goNav(page, "캘린더");
  await page.getByRole("button", { name: /mock/i }).first().click();
  await page.waitForTimeout(300);

  await goNav(page, "오늘 브리핑");
  await page.getByRole("button", { name: "지금 생성" }).click();
  await page.waitForTimeout(400);

  await goNav(page, "설정");
  await page.getByText("엑셀 파일 연결").first().waitFor({ timeout: 5000 });

  console.log("smoke ok");
}

async function main() {
  const browser = await chromium.launch();

  const desktop = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await desktop.goto(BASE, { waitUntil: "networkidle" });
  await desktop.evaluate(() => localStorage.clear());
  await desktop.reload({ waitUntil: "networkidle" });
  await dismissWelcome(desktop);
  await shot(desktop, "home");

  await goNav(desktop, "캘린더");
  await desktop.getByRole("button", { name: /mock/i }).first().click();
  await desktop.waitForTimeout(300);
  await shot(desktop, "calendar");

  await goNav(desktop, "오늘 브리핑");
  await desktop.waitForTimeout(300);
  await shot(desktop, "briefing");
  await desktop.close();

  const smokePage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await smokePage.goto(BASE, { waitUntil: "networkidle" });
  await smokePage.evaluate(() => localStorage.clear());
  await smokePage.reload({ waitUntil: "networkidle" });
  await smoke(smokePage);
  await smokePage.close();

  const mobileCtx = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: "networkidle" });
  await dismissWelcome(mobile);
  await shot(mobile, "mobile");
  await mobileCtx.close();

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
