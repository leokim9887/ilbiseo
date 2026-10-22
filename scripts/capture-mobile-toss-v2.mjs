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
  await page.waitForTimeout(480);
}

function seedCheerDay() {
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
  if (!Number.isFinite(hour) || hour < 7) {
    const [y, m, d] = cal.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  return cal;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    recordVideo: {
      dir: OUT,
      size: { width: 390, height: 844 },
    },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const cheerDay = seedCheerDay();
  await ctx.addInitScript((day) => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
  }, cheerDay);

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
    await page.waitForTimeout(250);
  }

  await tapBottom(page, "할 일");
  await page.locator(".excel-wb").waitFor({ timeout: 15000 });
  await page.waitForTimeout(350);
  await shot(page, "ilbiseo-mobile-toss-v2-todo.png");

  await tapBottom(page, "한 일");
  await page.waitForTimeout(400);
  await shot(page, "ilbiseo-mobile-toss-v2-tabs.png");

  // Motion still: mid tab-switch with indicator visible
  await tapBottom(page, "브리핑");
  await page.waitForTimeout(200);
  await shot(page, "ilbiseo-mobile-toss-v2-motion.png");

  // Extra switches for video
  await tapBottom(page, "설정");
  await page.waitForTimeout(350);
  await tapBottom(page, "할 일");
  await page.waitForTimeout(400);

  const videoPath = await page.video()?.path();
  await browser.close();

  if (videoPath && fs.existsSync(videoPath)) {
    const dest = path.join(OUT, "ilbiseo-mobile-toss-v2-motion.webm");
    fs.renameSync(videoPath, dest);
    console.log("wrote", dest);
  }
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
