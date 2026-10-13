import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4329/";
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
    {
      id: "t4",
      title: "가족 여행 일정표",
      memo: "버스·숙소",
      category: "personal",
      kind: "spot",
      importance: 2,
      urgency: 2,
      startDate: "2026-09-20",
      targetDate: "2026-09-28",
      groupKey: "여행",
      source: "manual",
      status: "completed",
      completedAt: "2026-09-28T00:00:00.000Z",
      createdAt: "2026-09-15T00:00:00.000Z",
    },
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
  const file = path.join(OUT, name);
  const opts = clip ? { path: file, clip } : { path: file, fullPage: false };
  await page.screenshot(opts);
  fs.copyFileSync(file, path.join(ART, name));
  console.log("wrote", file);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // PC fullscreen-ish (maximized desktop)
  {
    const ctx = await browser.newContext({
      viewport: { width: 1680, height: 980 },
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("[data-family-banner]").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(800);
    const text = await page.locator("[data-family-banner]").innerText();
    console.log("pc_banner_text", JSON.stringify(text.slice(0, 200)));
    const shell = await page.evaluate(() => {
      const main = document.querySelector("[data-family-banner]")?.closest("div.mx-auto");
      if (!main) return null;
      const r = main.getBoundingClientRect();
      return {
        width: Math.round(r.width),
        left: Math.round(r.left),
        right: Math.round(window.innerWidth - r.right),
        vw: window.innerWidth,
      };
    });
    console.log("pc_shell", JSON.stringify(shell));
    await shot(page, "ilbiseo-faces-fullscreen-pull-refresh-pc.png");
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) {
      await shot(page, "ilbiseo-faces-fullscreen-pull-refresh-pc-banner.png", {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
    }
    await ctx.close();
  }

  // Mobile
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("[data-family-banner]").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(800);
    const text = await page.locator("[data-family-banner]").innerText();
    console.log("mobile_banner_text", JSON.stringify(text.slice(0, 200)));
    await shot(page, "ilbiseo-faces-fullscreen-pull-refresh-mobile.png");
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) {
      await shot(page, "ilbiseo-faces-fullscreen-pull-refresh-mobile-banner.png", {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
    }

    // Pull-to-refresh via CDP touch (synthetic TouchEvent is flaky in headless)
    await page.evaluate(() => window.scrollTo(0, 0));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 195, y: 28 }],
    });
    for (const y of [60, 90, 120, 150, 175]) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 195, y }],
      });
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(120);
    const during = await page.locator("[data-pull-to-refresh]").count();
    console.log("pull_indicator_count", during);
    await shot(page, "ilbiseo-faces-fullscreen-pull-refresh-mobile-pull.png");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(700);
    await ctx.close();
  }

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
