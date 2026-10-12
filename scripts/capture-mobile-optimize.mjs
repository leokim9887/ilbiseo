import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4327/";
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: false });
  console.log("wrote", dest);
}

async function tapBottom(page, shortLabel) {
  const btn = page.locator("nav.fixed ul button", { hasText: shortLabel }).first();
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click({ force: true });
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  });
  const page = await ctx.newPage();
  const hideOverlay = () =>
    page.addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important;pointer-events:none!important}",
    });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "일비서" }).waitFor({ timeout: 30000 });
  await hideOverlay();
  await page.waitForTimeout(700);

  const start = page.getByRole("button", { name: "시작하기" });
  if (await start.count()) {
    await start.first().click({ force: true });
    await page.waitForTimeout(300);
  }

  await tapBottom(page, "할 일");
  await page.locator(".excel-wb").waitFor({ timeout: 10000 });
  await shot(page, "ilbiseo-mobile-todo-nav.png");

  const scroll = page.locator("[data-excel-scroll]");
  if (await scroll.count()) {
    await scroll.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shot(page, "ilbiseo-mobile-excel-scroll.png");
  }

  await tapBottom(page, "일정");
  await page.getByText("구글 캘린더").first().waitFor({ timeout: 10000 });
  // Prefer empty-state sample button
  const sample =
    page.getByRole("button", { name: "샘플 넣기" }).or(
      page.getByRole("button", { name: "샘플" }),
    );
  await sample.first().click({ force: true });
  await page.waitForTimeout(1000);
  await page.locator("[data-month-calendar]").waitFor({ timeout: 10000 });
  await shot(page, "ilbiseo-mobile-calendar.png");

  const dayWith = page
    .locator("[data-cal-day][data-cal-day-count]:not([data-cal-day-count='0'])")
    .first();
  await dayWith.waitFor({ timeout: 10000 });
  await dayWith.click({ force: true });
  await page.locator("[data-cal-day-detail]").waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  await shot(page, "ilbiseo-mobile-day-detail.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);

  await tapBottom(page, "설정");
  await page.getByText("PC ↔ 폰 동기화").waitFor({ timeout: 10000 });
  await shot(page, "ilbiseo-mobile-sync-settings.png");

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
