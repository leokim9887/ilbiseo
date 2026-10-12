import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/cursor/stores/self/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4317/";
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
      id: "t2",
      title: "병원 예약 확인",
      memo: "",
      category: "personal",
      kind: "someday",
      importance: 2,
      urgency: 1,
      startDate: null,
      targetDate: null,
      groupKey: "병원",
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
  ],
  checklists: [],
  guidelines: [
    {
      id: "g1",
      title: "아침 스트레칭 10분",
      memo: "허리",
      done: true,
      createdAt: now,
      completedAt: "2026-10-11T00:00:00.000Z",
    },
    {
      id: "g2",
      title: "저녁에 물 많이 마시기",
      memo: "",
      done: false,
      createdAt: now,
      completedAt: null,
    },
  ],
  habits: [
    {
      id: "h1",
      title: "산책 20분",
      memo: "집 앞",
      done: true,
      createdAt: now,
      completedAt: "2026-10-11T00:00:00.000Z",
    },
  ],
  calendarEvents: [],
};

async function shot(page, name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: false });
  fs.copyFileSync(dest, path.join(ART, name));
  console.log("wrote", dest);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // PC banner
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      locale: "ko-KR",
    });
    await ctx.addInitScript((seed) => {
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
      localStorage.setItem("ilbiseo-state-v2", JSON.stringify(seed));
    }, SEED);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "일비서" }).waitFor({ timeout: 30000 });
    await page.addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important}",
    });
    await page.waitForTimeout(600);
    const banner = page.locator("[data-family-banner]");
    await banner.waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "ilbiseo-family-banner-pc.png");
    await ctx.close();
  }

  // Mobile table (no horizontal scroll)
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "ko-KR",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    await ctx.addInitScript((seed) => {
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
      localStorage.setItem("ilbiseo-state-v2", JSON.stringify(seed));
    }, SEED);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "일비서" }).waitFor({ timeout: 30000 });
    await page.addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important}",
    });
    await page.waitForTimeout(500);
    // banner must be hidden on mobile
    const bannerVisible = await page.locator("[data-family-banner]").isVisible();
    console.log("mobile_banner_visible", bannerVisible);

    await page.locator("nav.fixed ul button", { hasText: "할 일" }).first().click({ force: true });
    await page.locator(".excel-wb, [data-excel-scroll]").first().waitFor({ timeout: 10000 });
    const scroll = page.locator("[data-excel-scroll]").first();
    await scroll.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const box = await scroll.boundingBox();
    const scrollW = await scroll.evaluate((el) => el.scrollWidth);
    const clientW = await scroll.evaluate((el) => el.clientWidth);
    console.log("mobile_table_scrollWidth", scrollW, "clientWidth", clientW, "overflow", scrollW - clientW, "boxW", box?.width);

    await shot(page, "ilbiseo-mobile-excel-fit.png");

    // 한 일 + 완료 지침 (no strikethrough)
    await page.locator("nav.fixed ul button", { hasText: "한 일" }).first().click({ force: true });
    await page.waitForTimeout(500);
    const sideDone = page.locator("[data-side-item-done='1']").first();
    if (await sideDone.count()) {
      await sideDone.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    }
    await shot(page, "ilbiseo-done-guidelines-no-strike.png");
    await ctx.close();
  }

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
