import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4332/";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const now = "2026-10-10T00:00:00.000Z";
const SEED = {
  version: 3,
  tasks: [
    {
      id: "t1",
      title: "헤드헌팅 후보 리스트 정리",
      memo: "A급",
      category: "work",
      kind: "spot",
      importance: 3,
      urgency: 2,
      startDate: "2026-10-12",
      targetDate: "2026-10-15",
      groupKey: "헤드헌팅",
      source: "manual",
      status: "active",
      completedAt: null,
      createdAt: now,
    },
  ],
  checklists: [],
  guidelines: [],
  habits: [],
  calendarEvents: [],
  excelLink: null,
  emailBriefing: null,
  updatedAt: now,
};

async function seed(ctx) {
  await ctx.addInitScript((payload) => {
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
    // Suppress daily cheer so banner is visible
    localStorage.setItem(
      "ilbiseo-daily-cheer-kst",
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() - 7 * 3600 * 1000)),
    );
    // Also set today's key via approximate: use a far-future? Better: set to current cheer day
    // Overwrite with today's cheer day by loading page then setting — use broad key
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  }, SEED);
}

async function shot(page, name, clip) {
  const p1 = path.join(OUT, name);
  await page.screenshot(clip ? { path: p1, clip } : { path: p1 });
  fs.copyFileSync(p1, path.join(ART, name));
  console.log("wrote", p1);
}

async function dismissCheerIfAny(page) {
  const cheer = page.locator("[data-daily-cheer]");
  if (await cheer.count()) {
    const btn = page.locator("[data-daily-cheer-confirm]");
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // PC
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
    await seed(ctx);
    // Force shown day = current cheer day after navigation helpers
    await ctx.addInitScript(() => {
      // set after modules — use broad: set key to many possible days
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      // cheer day at 07:00: if now < 07:00 use yesterday
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const get = (t) => parts.find((p) => p.type === t)?.value;
      let y = Number(get("year"));
      let m = Number(get("month"));
      let d = Number(get("day"));
      const hour = Number(get("hour"));
      if (hour < 7) {
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() - 1);
        y = dt.getUTCFullYear();
        m = dt.getUTCMonth() + 1;
        d = dt.getUTCDate();
      }
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      localStorage.setItem("ilbiseo-daily-cheer-kst", key);
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("[data-family-banner]", { timeout: 30000 });
    await dismissCheerIfAny(page);
    await page.waitForTimeout(400);
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) await shot(page, "ilbiseo-banner-dog-pc.png", box);
    await ctx.close();
  }

  // Mobile
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await seed(ctx);
    await ctx.addInitScript(() => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const get = (t) => parts.find((p) => p.type === t)?.value;
      let y = Number(get("year"));
      let m = Number(get("month"));
      let d = Number(get("day"));
      const hour = Number(get("hour"));
      if (hour < 7) {
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() - 1);
        y = dt.getUTCFullYear();
        m = dt.getUTCMonth() + 1;
        d = dt.getUTCDate();
      }
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      localStorage.setItem("ilbiseo-daily-cheer-kst", key);
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("[data-family-banner]", { timeout: 30000 });
    await dismissCheerIfAny(page);
    await page.waitForTimeout(400);
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) await shot(page, "ilbiseo-banner-dog-mobile.png", box);
    await ctx.close();
  }

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
