import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4317/";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    // Skip cheer
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
  await page.waitForTimeout(800);
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay],[data-daily-cheer]{display:none!important}",
  });

  // Inject toast in React tree via DOM (same markup/classes as app)
  await page.evaluate(() => {
    const existing = document.querySelector("[data-status-chip]");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.setAttribute("data-status-chip", "");
    el.setAttribute("role", "status");
    el.className =
      "fixed inset-x-3 top-3 z-50 mx-auto w-auto max-w-[min(22rem,calc(100%-1.5rem))] rounded-xl border px-4 py-3.5 text-center text-[15px] shadow-md max-sm:inset-x-4 max-sm:top-[max(0.85rem,env(safe-area-inset-top))] max-sm:border-transparent max-sm:bg-[var(--sheet)]/95 max-sm:px-5 border-[var(--brand)]/30 bg-[var(--sheet)] text-[var(--brand)] max-sm:text-[var(--toss-blue)]";
    el.textContent = "동기화 완료 · 이미 최신입니다";
    document.body.appendChild(el);
  });
  await page.waitForTimeout(400);

  const dest = path.join(OUT, "ilbiseo-toast-fixed.png");
  await page.screenshot({ path: dest, fullPage: false });
  console.log("wrote", dest);

  // Assert not clipped: toast box fully within viewport
  const box = await page.locator("[data-status-chip]").boundingBox();
  if (!box) throw new Error("toast missing");
  if (box.x < 4) throw new Error(`toast clipped left: x=${box.x}`);
  if (box.x + box.width > 390 - 4)
    throw new Error(`toast clipped right: right=${box.x + box.width}`);
  console.log("toast box ok", box);

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
