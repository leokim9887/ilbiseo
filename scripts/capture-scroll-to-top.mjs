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

async function dismissOverlays(page) {
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay],[data-daily-cheer]{display:none!important;pointer-events:none!important}",
  });
  const welcome = page.getByRole("button", { name: "시작하기" });
  if (await welcome.count()) {
    await welcome.first().click({ force: true });
    await page.waitForTimeout(250);
  }
}

async function ensureScrollable(page) {
  await page.evaluate(() => {
    const pad = document.createElement("div");
    pad.setAttribute("data-scroll-pad", "1");
    pad.style.height = "1600px";
    pad.style.pointerEvents = "none";
    pad.style.opacity = "0";
    document.body.appendChild(pad);
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const cheerDay = seedCheerDay();

  // —— Mobile ——
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await mobileCtx.addInitScript((day) => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
  }, cheerDay);

  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await mobile.waitForTimeout(900);
  await dismissOverlays(mobile);
  await ensureScrollable(mobile);

  // Near top — button should be hidden
  await mobile.evaluate(() => window.scrollTo(0, 40));
  await mobile.waitForTimeout(350);
  const hidden = await mobile.locator("[data-scroll-to-top]").evaluate((el) => {
    const s = getComputedStyle(el);
    return s.opacity === "0" || s.pointerEvents === "none";
  });
  console.log("mobile near-top hidden:", hidden);

  // Past threshold — button visible above tab bar
  await mobile.evaluate(() => window.scrollTo(0, 520));
  await mobile.waitForTimeout(450);
  await mobile.locator("[data-scroll-to-top]").waitFor({ state: "visible" });
  await shot(mobile, "ilbiseo-scroll-top-mobile.png");

  // Tap → smooth scroll to top (for webm)
  await mobile.locator("[data-scroll-to-top]").click({ force: true });
  await mobile.waitForTimeout(900);
  await mobile.evaluate(() => window.scrollTo(0, 700));
  await mobile.waitForTimeout(400);
  await mobile.locator("[data-scroll-to-top]").click({ force: true });
  await mobile.waitForTimeout(1000);

  const videoPath = await mobile.video()?.path();
  await mobileCtx.close();

  if (videoPath && fs.existsSync(videoPath)) {
    const dest = path.join(OUT, "ilbiseo-scroll-top-motion.webm");
    fs.renameSync(videoPath, dest);
    console.log("wrote", dest);
  }

  // —— Desktop ——
  const deskCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "ko-KR",
  });
  await deskCtx.addInitScript((day) => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
  }, cheerDay);

  const desk = await deskCtx.newPage();
  await desk.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await desk.waitForTimeout(900);
  await dismissOverlays(desk);
  await ensureScrollable(desk);
  await desk.evaluate(() => window.scrollTo(0, 560));
  await desk.waitForTimeout(450);
  await desk.locator("[data-scroll-to-top]").waitFor({ state: "visible" });
  await shot(desk, "ilbiseo-scroll-top-desktop.png");
  await deskCtx.close();

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
