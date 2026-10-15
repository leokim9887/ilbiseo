import { chromium, devices } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

mkdirSync(OUT, { recursive: true });

async function dismissOverlays(page) {
  const cheer = page.locator("[data-daily-cheer-confirm]");
  if (await cheer.count()) {
    await cheer.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
  const welcome = page.getByRole("button", { name: "시작하기" });
  if (await welcome.isVisible().catch(() => false)) {
    await welcome.click();
    await page.waitForTimeout(300);
  }
  const close = page.getByRole("button", { name: /닫기|나중에|그만/ }).first();
  if (await close.isVisible().catch(() => false)) {
    await close.click().catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function shot(page, name) {
  const path = `${OUT}/ilbiseo-clean-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log("wrote", path);
}

async function assertNoSample(page) {
  const sample = page.getByText("샘플", { exact: false });
  const count = await sample.count();
  const visible = [];
  for (let i = 0; i < count; i++) {
    if (await sample.nth(i).isVisible().catch(() => false)) {
      visible.push(await sample.nth(i).innerText());
    }
  }
  if (visible.length) {
    throw new Error(`Unexpected visible 샘플 text: ${visible.join(" | ")}`);
  }
}

async function assertNoBriefingToolbar(page) {
  for (const name of ["지금 생성", "엑셀 파일 저장", "다른 이름으로 저장"]) {
    const btn = page.getByRole("button", { name });
    if (await btn.isVisible().catch(() => false)) {
      throw new Error(`Briefing toolbar still shows: ${name}`);
    }
  }
}

async function main() {
  const browser = await chromium.launch();
  const desktop = await browser.newPage({
    viewport: { width: 1360, height: 900 },
  });
  await desktop.goto(BASE, { waitUntil: "networkidle" });
  await desktop.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    // Mark cheer already shown for today (KST-ish ISO date)
    localStorage.setItem(
      "ilbiseo-daily-cheer-kst",
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }),
    );
  });
  await desktop.reload({ waitUntil: "networkidle" });
  await dismissOverlays(desktop);

  // Calendar — no 샘플 chip
  await desktop.getByRole("button", { name: /^캘린더/ }).first().click();
  await desktop.waitForTimeout(600);
  await desktop.getByRole("heading", { name: "구글 캘린더" }).waitFor();
  await assertNoSample(desktop);
  await shot(desktop, "calendar-no-sample");

  // Briefing — no save/generate toolbar
  await desktop.getByRole("button", { name: /브리핑/ }).first().click();
  await desktop.waitForTimeout(600);
  await desktop.getByRole("heading", { name: /오늘 브리핑/ }).waitFor();
  await assertNoBriefingToolbar(desktop);
  await shot(desktop, "briefing-no-save-row");

  // Settings — excel save still reachable
  await desktop.getByRole("button", { name: /설정/ }).first().click();
  await desktop.waitForTimeout(500);
  await desktop.getByRole("heading", { name: /설정/ }).waitFor();
  await desktop.getByRole("button", { name: "엑셀 파일 저장" }).waitFor();
  await shot(desktop, "settings-excel-save");

  await desktop.close();

  const mobileCtx = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    localStorage.setItem(
      "ilbiseo-daily-cheer-kst",
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }),
    );
  });
  await mobile.reload({ waitUntil: "networkidle" });
  await dismissOverlays(mobile);

  await mobile.getByRole("button", { name: /캘린더|일정/ }).first().click();
  await mobile.waitForTimeout(600);
  await assertNoSample(mobile);
  await shot(mobile, "calendar-mobile");

  await mobile.getByRole("button", { name: /브리핑/ }).first().click();
  await mobile.waitForTimeout(600);
  await assertNoBriefingToolbar(mobile);
  await shot(mobile, "briefing-mobile");

  await browser.close();
  console.log("allOk: true");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
