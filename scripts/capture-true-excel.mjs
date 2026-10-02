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
  const path = `${OUT}/ilbiseo-true-excel-${name}.png`;
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
  await desktop.getByText("일비서.xlsx").waitFor();
  await desktop.getByText("① 스팟성 할일").waitFor();

  // smoke: add row, edit title, memo, complete
  await desktop.getByRole("button", { name: "행 추가" }).click();
  await desktop.waitForTimeout(250);
  const titles = desktop.locator('input[aria-label="제목"]');
  await titles.last().fill("진짜엑셀 스모크");
  const memos = desktop.locator('input[aria-label="메모"]');
  await memos.last().fill("메모확인");
  await desktop.waitForTimeout(200);
  await shot(desktop, "workbook");

  // section bands visible
  await desktop.getByText("② 지속성 할일").waitFor();
  await desktop.getByText("③ 언젠가 해야할 일").waitFor();
  await shot(desktop, "sections");

  // complete first checkbox on new row (last data checkbox)
  const checks = desktop.locator('input[type="checkbox"][aria-label*="완료"]');
  await checks.last().check();
  await desktop.waitForTimeout(350);
  await desktop.getByRole("button", { name: "한 일", exact: true }).last().click();
  await desktop.waitForTimeout(350);
  await desktop.getByText("진짜엑셀 스모크").waitFor();
  await shot(desktop, "done-sheet");

  // settings excel still present
  await desktop.getByRole("button", { name: /^설정/ }).first().click();
  await desktop.getByText("엑셀 파일 연결").first().waitFor();

  await desktop.close();

  const mobileCtx = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: "networkidle" });
  await dismissWelcome(mobile);
  await mobile.getByRole("button", { name: "할 일" }).click();
  await mobile.waitForTimeout(400);
  await shot(mobile, "mobile");
  await mobileCtx.close();
  await browser.close();
  console.log("smoke ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
