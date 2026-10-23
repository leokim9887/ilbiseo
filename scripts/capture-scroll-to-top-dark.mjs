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
    if (document.querySelector("[data-scroll-pad]")) return;
    const pad = document.createElement("div");
    pad.setAttribute("data-scroll-pad", "1");
    pad.style.height = "1600px";
    pad.style.pointerEvents = "none";
    pad.setAttribute(
      "style",
      "height:1600px;pointer-events:none;opacity:0.15;background:linear-gradient(#2a6b60,#1a221e)",
    );
    document.body.appendChild(pad);
  });
}

async function captureTheme(browser, { theme, viewport, name, closeup }) {
  const cheerDay = seedCheerDay();
  const ctx = await browser.newContext({
    ...viewport,
    locale: "ko-KR",
    colorScheme: theme === "dark" ? "dark" : "light",
  });
  await ctx.addInitScript(
    ({ day, theme }) => {
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
      localStorage.setItem("ilbiseo-daily-cheer-kst", day);
      localStorage.setItem("ilbiseo-theme", theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
    },
    { day: cheerDay, theme },
  );

  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate((t) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    localStorage.setItem("ilbiseo-theme", t);
  }, theme);
  await dismissOverlays(page);
  await ensureScrollable(page);
  await page.evaluate(() => window.scrollTo(0, 560));
  await page.waitForTimeout(500);
  await page.locator("[data-scroll-to-top][data-visible='1']").waitFor({
    state: "visible",
    timeout: 8000,
  });

  // Assert not the pale-bug combo
  const stats = await page.locator("[data-scroll-to-top]").evaluate((el) => {
    const s = getComputedStyle(el);
    const icon = el.querySelector(".scroll-to-top-icon");
    const is = icon ? getComputedStyle(icon) : null;
    return {
      bg: s.backgroundColor,
      color: s.color,
      opacity: s.opacity,
      backdrop: s.backdropFilter || s.webkitBackdropFilter,
      iconColor: is?.color,
      iconW: is?.width,
    };
  });
  console.log(theme, name, stats);

  await shot(page, name);
  if (closeup) {
    const box = await page.locator("[data-scroll-to-top]").boundingBox();
    if (box) {
      const dest = path.join(OUT, closeup);
      await page.screenshot({
        path: dest,
        clip: {
          x: Math.max(0, box.x - 24),
          y: Math.max(0, box.y - 24),
          width: box.width + 48,
          height: box.height + 48,
        },
      });
      console.log("wrote", dest);
    }
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  await captureTheme(browser, {
    theme: "dark",
    viewport: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
    name: "ilbiseo-scroll-top-dark-fixed.png",
    closeup: "ilbiseo-scroll-top-dark-fixed-closeup.png",
  });
  await captureTheme(browser, {
    theme: "light",
    viewport: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
    name: "ilbiseo-scroll-top-light-glass.png",
  });
  await captureTheme(browser, {
    theme: "dark",
    viewport: {
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    },
    name: "ilbiseo-scroll-top-dark-desktop.png",
  });
  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
