import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4330/";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const now = "2026-10-10T00:00:00.000Z";
const manyTasks = Array.from({ length: 18 }, (_, i) => ({
  id: `t-long-${i}`,
  title: `할 일 LIST UP 샘플 ${i + 1}`,
  memo: i % 3 === 0 ? "메모" : "",
  category: "work",
  kind: "spot",
  importance: (i % 3) + 1,
  urgency: ((i + 1) % 3) + 1,
  startDate: "2026-10-12",
  targetDate: "2026-10-20",
  groupKey: "샘플",
  source: "manual",
  status: "active",
  completedAt: null,
  createdAt: now,
}));

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
    {
      id: "t3",
      title: "세금 서류 스캔",
      memo: "작년 분",
      category: "work",
      kind: "ongoing",
      importance: 2,
      urgency: 3,
      startDate: "2026-10-01",
      targetDate: "2026-10-20",
      groupKey: "세금",
      source: "manual",
      status: "completed",
      completedAt: "2026-10-11T00:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    ...manyTasks,
  ],
  checklists: [],
  guidelines: [],
  habits: [],
  calendarEvents: [
    {
      id: "c1",
      title: "치과",
      start: "2026-10-13T01:00:00.000Z",
      end: "2026-10-13T02:00:00.000Z",
      allDay: false,
      source: "manual",
    },
  ],
  excelLink: null,
  emailBriefing: null,
  updatedAt: now,
};

async function seed(context) {
  await context.addInitScript((payload) => {
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
    localStorage.removeItem("ilbiseo-daily-cheer-kst");
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    localStorage.setItem(
      "ilbiseo-device-sync",
      JSON.stringify({
        enabled: false,
        code: "",
        lastSyncedAt: null,
        localUpdatedAt: null,
      }),
    );
  }, SEED);
}

async function shot(page, name, clip) {
  const p1 = path.join(OUT, name);
  const opts = clip
    ? { path: p1, clip }
    : { path: p1, fullPage: false };
  await page.screenshot(opts);
  fs.copyFileSync(p1, path.join(ART, name));
  console.log("wrote", p1);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // --- Mobile: family banner larger / left-filled ---
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("[data-family-banner]", { timeout: 30000 });
    await page.waitForTimeout(600);
    // Capture cheer first if shown
    const cheer = page.locator("[data-daily-cheer]");
    if (await cheer.count()) {
      await shot(page, "ilbiseo-daily-cheer-overlay-mobile.png");
      await page.locator("[data-daily-cheer-confirm]").click();
      await page.waitForTimeout(300);
    }
    await shot(page, "ilbiseo-banner-scroll-cheer-mobile.png");
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) {
      await shot(page, "ilbiseo-banner-scroll-cheer-mobile-banner.png", box);
    }
    await ctx.close();
  }

  // --- PC: 5 faces + cheer + tall table scroll note ---
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 980 },
      deviceScaleFactor: 1,
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("[data-family-banner]", { timeout: 30000 });
    await page.waitForTimeout(600);
    const cheer = page.locator("[data-daily-cheer]");
    if (await cheer.count()) {
      await shot(page, "ilbiseo-daily-cheer-overlay-pc.png");
      await page.locator("[data-daily-cheer-confirm]").click();
      await page.waitForTimeout(300);
    }
    await shot(page, "ilbiseo-banner-scroll-cheer-pc.png");
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) {
      await shot(page, "ilbiseo-banner-scroll-cheer-pc-banner.png", box);
    }

    // Scroll note: tall table with inner scrollbar visible
    const table = page.locator("[data-excel-scroll]");
    await table.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, "ilbiseo-banner-scroll-cheer-pc-table.png");
    await ctx.close();
  }

  // --- PC short table (few rows) — page scroll OK state ---
  {
    const shortSeed = {
      ...SEED,
      tasks: SEED.tasks.filter((t) => !String(t.id).startsWith("t-long-")),
    };
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 980 },
      deviceScaleFactor: 1,
    });
    await ctx.addInitScript((data) => {
      localStorage.setItem("ilbiseo-state-v2", JSON.stringify(data));
      localStorage.setItem(
        "ilbiseo-daily-cheer-kst",
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
      );
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    }, shortSeed);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("[data-excel-scroll]", { timeout: 30000 });
    await page.locator("[data-excel-scroll]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, "ilbiseo-banner-scroll-cheer-pc-table-short.png");
    await ctx.close();
  }

  await browser.close();
  console.log("capture done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
