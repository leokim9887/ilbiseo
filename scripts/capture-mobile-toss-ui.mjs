import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4317/";
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: false });
  console.log("wrote", dest);
}

async function tapBottom(page, shortLabel) {
  const btn = page
    .locator("nav[data-toss-tabbar] button", { hasText: shortLabel })
    .first();
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click({ force: true });
  await page.waitForTimeout(450);
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
    // Match cheerDayIsoKst(): Asia/Seoul day with 07:00 boundary
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(new Date());
    const pick = (t) => parts.find((p) => p.type === t)?.value ?? "0";
    let hour = Number.parseInt(pick("hour"), 10);
    if (hour === 24) hour = 0;
    const cal = `${pick("year")}-${pick("month")}-${pick("day")}`;
    let cheerDay = cal;
    if (!Number.isFinite(hour) || hour < 7) {
      const [y, m, d] = cal.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - 1);
      cheerDay = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    }
    localStorage.setItem("ilbiseo-daily-cheer-kst", cheerDay);
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay],[data-daily-cheer]{display:none!important;pointer-events:none!important}",
  });

  const welcome = page.getByRole("button", { name: "시작하기" });
  if (await welcome.count()) {
    await welcome.first().click({ force: true });
    await page.waitForTimeout(300);
  }
  const cheerStart = page.locator("[data-daily-cheer-confirm]");
  if (await cheerStart.count()) {
    await cheerStart.first().click({ force: true });
    await page.waitForTimeout(250);
  }

  await tapBottom(page, "할 일");
  await page.locator(".excel-wb").waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  await shot(page, "ilbiseo-mobile-toss-todo.png");

  // Tabs: show bottom bar with 「한 일」 active (Toss blue)
  await tapBottom(page, "한 일");
  await page.getByText("DONE LIST").or(page.getByText("한 일")).first().waitFor({
    timeout: 8000,
  }).catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "ilbiseo-mobile-toss-tabs.png");

  await tapBottom(page, "브리핑");
  await page
    .locator("[data-panel-shell], [data-briefing-panel]")
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(400);
  await shot(page, "ilbiseo-mobile-toss-briefing.png");

  await tapBottom(page, "설정");
  await page
    .getByRole("heading", { name: "설정" })
    .or(page.locator("[data-device-sync]"))
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(400);
  await shot(page, "ilbiseo-mobile-toss-settings.png");

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
