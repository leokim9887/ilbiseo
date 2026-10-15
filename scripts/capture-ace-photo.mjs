import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4331/";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const now = "2026-10-10T00:00:00.000Z";
const SEED = {
  version: 3,
  tasks: [
    {
      id: "t1",
      title: "헤드헌팅 후보 리스트 정리",
      memo: "A급 후보 3명",
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

async function seed(context, { cheerIdx = 2 } = {}) {
  await context.addInitScript(
    ({ payload, cheerIdx }) => {
      localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
      localStorage.removeItem("ilbiseo-daily-cheer-kst");
      localStorage.setItem("ilbiseo-daily-cheer-idx", String(cheerIdx));
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    },
    { payload: SEED, cheerIdx },
  );
}

async function shot(page, name, clip) {
  const p1 = path.join(OUT, name);
  const opts = clip ? { path: p1, clip } : { path: p1, fullPage: false };
  await page.screenshot(opts);
  fs.copyFileSync(p1, path.join(ART, name));
  console.log("wrote", p1);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // PC: cheer + banner
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
    await seed(ctx, { cheerIdx: 2 });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(500);
    await shot(page, "ilbiseo-banner-ace-photo-cheer-pc.png");
    await page.locator("[data-daily-cheer-confirm]").click();
    await page.waitForTimeout(400);
    await shot(page, "ilbiseo-banner-ace-photo-pc.png");
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) await shot(page, "ilbiseo-banner-ace-photo-pc-banner.png", box);
    await ctx.close();
  }

  // Mobile: cheer + banner
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await seed(ctx, { cheerIdx: 10 });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(500);
    await shot(page, "ilbiseo-banner-ace-photo-cheer-mobile.png");
    await page.locator("[data-daily-cheer-confirm]").click();
    await page.waitForTimeout(400);
    await shot(page, "ilbiseo-banner-ace-photo-mobile.png");
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) await shot(page, "ilbiseo-banner-ace-photo-mobile-banner.png", box);
    await ctx.close();
  }

  await browser.close();
  console.log("capture done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
