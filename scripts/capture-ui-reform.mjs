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

async function smoke(page) {
  await dismissWelcome(page);

  // add task
  await page.getByRole("button", { name: "항목 추가" }).first().click();
  await page.waitForTimeout(200);
  const title = page.getByLabel("할 일 제목").first();
  await title.fill("UI개편 스모크 항목");
  await page.waitForTimeout(200);

  // complete → 한 일
  await page.getByLabel(/완료 → 한 일로 이동/).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^한 일/ }).first().click();
  await page.waitForTimeout(300);
  const restored = page.getByText("UI개편 스모크 항목");
  if (!(await restored.isVisible())) throw new Error("한 일 이동 실패");

  // checklist
  await page.getByRole("button", { name: /체크/ }).first().click();
  await page.getByPlaceholder("체크 항목 적기").fill("체크 스모크");
  await page.getByRole("button", { name: "추가" }).click();
  await page.waitForTimeout(200);
  await page.getByText("체크 스모크").click();
  await page.waitForTimeout(200);

  // calendar
  await page.getByRole("button", { name: /캘린더|일정/ }).first().click();
  await page.waitForTimeout(200);
  const mock = page.getByRole("button", { name: /mock/i }).first();
  if (await mock.isVisible()) await mock.click();
  await page.waitForTimeout(300);

  // briefing
  await page.getByRole("button", { name: /브리핑/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "지금 생성" }).click();
  await page.waitForTimeout(400);

  // settings excel
  await page.getByRole("button", { name: /설정/ }).first().click();
  await page.waitForTimeout(200);
  if (!(await page.getByText("엑셀 파일 연결").first().isVisible())) {
    throw new Error("엑셀 연결 UI 없음");
  }

  console.log("smoke ok");
}

async function main() {
  const browser = await chromium.launch();
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desktop.goto(BASE, { waitUntil: "networkidle" });
  await desktop.evaluate(() => {
    localStorage.clear();
  });
  await desktop.reload({ waitUntil: "networkidle" });
  await dismissWelcome(desktop);
  await shot(desktop, "home");

  await desktop.getByRole("button", { name: /^캘린더/ }).first().click();
  await desktop.waitForTimeout(250);
  const mock = desktop.getByRole("button", { name: /mock/i }).first();
  if (await mock.isVisible()) await mock.click();
  await desktop.waitForTimeout(300);
  await shot(desktop, "calendar");

  await desktop.getByRole("button", { name: /브리핑/ }).first().click();
  await desktop.waitForTimeout(400);
  await shot(desktop, "briefing");

  await smoke(desktop);

  const mobileCtx = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: "networkidle" });
  await dismissWelcome(mobile);
  await shot(mobile, "mobile");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
