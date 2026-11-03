import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4317/";
fs.mkdirSync(OUT, { recursive: true });

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";

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

async function openApp(ctx) {
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
  await page.locator("nav[data-toss-tabbar]").waitFor({ timeout: 15000 });
  return page;
}

async function shot(page, name, clip) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: false, clip });
  console.log("wrote", dest);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // --- iPhone: idle + pressed glass ---
  const iosCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    userAgent: IOS_UA,
  });
  const ios = await openApp(iosCtx);
  const gate = await ios.locator("nav[data-toss-tabbar]").getAttribute("data-ios-glass");
  console.log("ios data-ios-glass =", gate);
  if (gate !== "1") throw new Error(`expected data-ios-glass=1, got ${gate}`);

  await shot(ios, "ilbiseo-iphone-tab-glass-idle.png");

  // Idle already shows active-tab frost on 할 일; force press glass on 일정
  await ios.addStyleTag({
    content: `
      nav[data-toss-tabbar][data-ios-glass="1"] button[data-demo-press="1"] {
        opacity: 1 !important;
        transform: scale(0.92) !important;
        background-color: transparent !important;
        box-shadow: none !important;
      }
      nav[data-toss-tabbar][data-ios-glass="1"] button[data-demo-press="1"]::before {
        opacity: 1 !important;
        background: linear-gradient(
          165deg,
          rgba(255, 255, 255, 0.98) 0%,
          rgba(230, 237, 245, 0.88) 52%,
          rgba(214, 224, 236, 0.7) 100%
        ) !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 1),
          inset 0 -1px 0 rgba(15, 23, 42, 0.06),
          0 2px 6px rgba(15, 23, 42, 0.08),
          0 0 0 0.5px rgba(15, 23, 42, 0.08) !important;
      }
      .dark nav[data-toss-tabbar][data-ios-glass="1"] button[data-demo-press="1"]::before {
        background: linear-gradient(
          165deg,
          rgba(255, 255, 255, 0.28) 0%,
          rgba(255, 255, 255, 0.12) 55%,
          rgba(255, 255, 255, 0.06) 100%
        ) !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.32),
          inset 0 -1px 0 rgba(0, 0, 0, 0.4),
          0 2px 8px rgba(0, 0, 0, 0.45),
          0 0 0 0.5px rgba(255, 255, 255, 0.12) !important;
      }
    `,
  });
  await ios
    .locator('nav[data-toss-tabbar] button[data-toss-tab="calendar"]')
    .evaluate((el) => el.setAttribute("data-demo-press", "1"));
  await ios.waitForTimeout(200);
  await shot(ios, "ilbiseo-iphone-tab-glass-press.png");

  // Close-up of tab bar while pressed
  const bar = await ios.locator("nav[data-toss-tabbar]").boundingBox();
  if (bar) {
    await shot(ios, "ilbiseo-iphone-tab-glass-press-closeup.png", {
      x: Math.max(0, bar.x),
      y: Math.max(0, bar.y - 8),
      width: bar.width,
      height: Math.min(bar.height + 16, 120),
    });
  }

  // Dark mode press
  await ios.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await ios.waitForTimeout(250);
  await shot(ios, "ilbiseo-iphone-tab-glass-press-dark.png");
  await iosCtx.close();

  // --- Android / Samsung: gate off, subtle press only ---
  const andCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    userAgent: ANDROID_UA,
  });
  const and = await openApp(andCtx);
  const andGate = await and
    .locator("nav[data-toss-tabbar]")
    .getAttribute("data-ios-glass");
  console.log("android data-ios-glass =", andGate);
  if (andGate !== "0") throw new Error(`expected data-ios-glass=0, got ${andGate}`);
  await shot(and, "ilbiseo-android-tab-no-glass.png");
  await andCtx.close();

  await browser.close();
  console.log("ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
