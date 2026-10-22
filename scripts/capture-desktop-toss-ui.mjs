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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "ko-KR",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
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
    let day = `${pick("year")}-${pick("month")}-${pick("day")}`;
    if (!Number.isFinite(hour) || hour < 7) {
      const [y, m, d] = day.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() - 1);
      day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    }
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
  });

  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay],[data-daily-cheer]{display:none!important}",
  });

  const welcome = page.getByRole("button", { name: "시작하기" });
  if (await welcome.count()) {
    await welcome.first().click({ force: true });
    await page.waitForTimeout(300);
  }

  // Desktop nav (not bottom bar)
  const desktopTodo = page.locator(
    'nav[data-toss-desktop-nav] button[aria-label^="할 일"]',
  );
  await desktopTodo.first().click({ force: true });
  await page.locator(".excel-wb").waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  await shot(page, "ilbiseo-desktop-toss-todo.png");

  await page
    .locator('nav[data-toss-desktop-nav] button[aria-label^="오늘 브리핑"]')
    .first()
    .click({ force: true });
  await page.locator("[data-panel-shell]").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await shot(page, "ilbiseo-desktop-toss-briefing.png");

  await page
    .locator('nav[data-toss-desktop-nav] button[aria-label^="설정"]')
    .first()
    .click({ force: true });
  await page.waitForTimeout(400);
  await shot(page, "ilbiseo-desktop-toss-settings.png");

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
