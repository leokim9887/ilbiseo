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
  const path = `${OUT}/ilbiseo-excel-todo-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}

async function goNav(page, label) {
  await page
    .locator("nav[aria-label='주요 메뉴']")
    .first()
    .getByRole("button", { name: new RegExp(`^${label}`) })
    .click();
  await page.waitForTimeout(350);
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

  // confirm no checklist nav
  const texts = await desktop.locator("nav").first().allInnerTexts();
  if (texts.join(" ").includes("체크리스트") || texts.join(" ").includes("체크\n")) {
    // mobile short "체크" shouldn't exist either in desktop nav
  }
  const navText = await desktop.locator("nav").first().innerText();
  if (navText.includes("체크리스트")) {
    throw new Error("체크리스트 네비가 아직 있음");
  }

  await goNav(desktop, "할 일");
  await desktop.getByRole("columnheader", { name: "제목" }).waitFor();
  await shot(desktop, "desktop");

  await desktop.getByRole("button", { name: "행 추가" }).first().click();
  await desktop.waitForTimeout(200);
  await shot(desktop, "desktop-add");

  await goNav(desktop, "오늘 브리핑");
  await desktop.waitForTimeout(300);
  const body = await desktop.innerText("body");
  if (body.includes("【체크리스트】")) {
    throw new Error("브리핑에 체크리스트 블록 남음");
  }
  await shot(desktop, "briefing");
  await desktop.close();

  const mobileCtx = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: "networkidle" });
  await dismissWelcome(mobile);
  await mobile.getByRole("button", { name: "할 일" }).click();
  await mobile.waitForTimeout(300);
  await shot(mobile, "mobile");
  await mobileCtx.close();
  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
