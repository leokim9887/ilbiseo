import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4328/";
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

async function shot(page, name, clip) {
  const file = path.join(OUT, name);
  const opts = { path: file, type: "png", animations: "disabled" };
  if (clip) opts.clip = clip;
  else opts.fullPage = false;
  await page.screenshot(opts);
  fs.copyFileSync(file, path.join(ART, name));
  console.log("saved", name);
}

async function openSeeded(browser, contextOpts) {
  const ctx = await browser.newContext(contextOpts);
  await ctx.addInitScript((data) => {
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(data));
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  }, SEED);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("[data-family-banner]").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  {
    const { ctx, page } = await openSeeded(browser, {
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      locale: "ko-KR",
    });
    const text = await page.locator("[data-family-banner]").innerText();
    console.log("pc_banner_text", JSON.stringify(text.slice(0, 200)));
    await shot(page, "ilbiseo-banner-photo-polish-pc.png");
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) {
      await shot(page, "ilbiseo-banner-photo-polish-pc-banner.png", {
        x: Math.max(0, box.x - 8),
        y: Math.max(0, box.y - 8),
        width: Math.min(1280, box.width + 16),
        height: Math.min(560, box.height + 16),
      });
    }
    await ctx.close();
  }

  {
    const { ctx, page } = await openSeeded(browser, {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "ko-KR",
    });
    const text = await page.locator("[data-family-banner]").innerText();
    console.log("mobile_banner_text", JSON.stringify(text.slice(0, 200)));
    await shot(page, "ilbiseo-banner-photo-polish-mobile.png");
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) {
      await shot(page, "ilbiseo-banner-photo-polish-mobile-banner.png", {
        x: Math.max(0, box.x),
        y: Math.max(0, box.y),
        width: Math.min(390, box.width),
        height: Math.min(460, box.height + 4),
      });
    }
    await ctx.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
