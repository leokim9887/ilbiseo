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
  const path = `${OUT}/ilbiseo-father-ref-${name}.png`;
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

  // Exact father headers must be present
  for (const h of [
    "순서",
    "할일 LIST UP",
    "마감목표",
    "중요도",
    "시급성",
    "완료여부",
  ]) {
    await desktop.getByRole("columnheader", { name: h }).waitFor({ timeout: 5000 });
  }

  await desktop.getByRole("button", { name: "행 추가" }).click();
  await desktop.waitForTimeout(250);
  const listup = desktop.locator('textarea[aria-label="할일 LIST UP"]').first();
  await listup.fill("아버지 표 형식 스모크 — LIST UP 칸");
  await desktop.waitForTimeout(200);
  await desktop
    .getByRole("row", { name: /아버지 표 형식 스모크/ })
    .getByLabel("마감목표")
    .fill("9/30");
  await desktop.waitForTimeout(200);
  await shot(desktop, "headers");

  // crop-ish: screenshot workbook only
  const wb = desktop.locator(".excel-wb");
  await wb.screenshot({ path: `${OUT}/ilbiseo-father-ref-grid.png` });
  console.log("wrote", `${OUT}/ilbiseo-father-ref-grid.png`);

  await desktop
    .locator("nav[aria-label='주요 메뉴']")
    .first()
    .getByRole("button", { name: /^설정/ })
    .click();
  await desktop.getByText("엑셀 파일 연결").first().waitFor();

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
