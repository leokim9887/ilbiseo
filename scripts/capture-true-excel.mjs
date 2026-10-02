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

  await desktop.getByRole("button", { name: "행 추가" }).click();
  await desktop.waitForTimeout(300);
  const title = desktop.locator('input[aria-label="제목"]').last();
  await title.click();
  await title.fill("진짜엑셀 스모크");
  await title.press("Tab");
  await desktop.waitForTimeout(200);
  await desktop.locator('input[aria-label="메모"]').last().fill("메모확인");
  await desktop.waitForTimeout(300);
  await shot(desktop, "workbook");

  await desktop.getByText("② 지속성 할일").waitFor();
  await desktop.getByText("③ 언젠가 해야할 일").waitFor();
  await shot(desktop, "sections");

  const clicked = await desktop.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[aria-label="제목"]')];
    const input = inputs.find((el) => el.value === "진짜엑셀 스모크");
    if (!input) return false;
    const row = input.closest("tr");
    const box = row?.querySelector('input[type="checkbox"]');
    if (!box) return false;
    box.click();
    return true;
  });
  if (!clicked) throw new Error("스모크 행 완료 클릭 실패");
  await desktop.waitForTimeout(600);

  // Prefer top nav "한 일 N건"
  await desktop
    .locator("nav[aria-label='주요 메뉴']")
    .first()
    .getByRole("button", { name: /^한 일/ })
    .click();
  await desktop.waitForTimeout(500);

  const findSmoke = () =>
    desktop.evaluate(() =>
      [...document.querySelectorAll("input")].some(
        (el) => el.value === "진짜엑셀 스모크",
      ),
    );

  let onDone = await findSmoke();
  if (!onDone) {
    await desktop.locator(".excel-wb").getByRole("button", { name: "한 일" }).click();
    await desktop.waitForTimeout(400);
    onDone = await findSmoke();
  }
  if (!onDone) throw new Error("한 일 시트에 스모크 항목 없음");
  await shot(desktop, "done-sheet");

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
  console.log("smoke ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
