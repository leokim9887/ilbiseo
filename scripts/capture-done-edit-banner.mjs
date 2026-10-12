import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4327/";
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
  guidelines: [
    {
      id: "g1",
      title: "아침 스트레칭 10분",
      memo: "허리",
      done: true,
      createdAt: now,
      completedAt: "2026-10-11T00:00:00.000Z",
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

async function shot(page, name, clip) {
  const dest = path.join(OUT, name);
  const opts = clip ? { path: dest, clip } : { path: dest, fullPage: false };
  await page.screenshot(opts);
  try {
    fs.copyFileSync(dest, path.join(ART, name));
  } catch {
    /* artifacts may be unavailable */
  }
  console.log("wrote", dest);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // PC: expanded family banner (no old title strip)
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
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
    await page.locator("[data-family-banner]").waitFor({ state: "visible", timeout: 30000 });
    await page.addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important}",
    });
    await page.waitForTimeout(700);

    // Branding strip must be gone on PC
    const h1Visible = await page
      .locator("header h1")
      .evaluateAll((els) =>
        els.some((el) => {
          const s = getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden" && el.offsetParent !== null;
        }),
      );
    console.log("pc_h1_visible", h1Visible);

    const subText = await page
      .locator("[data-family-banner]")
      .innerText();
    console.log("banner_text", JSON.stringify(subText));

    await shot(page, "ilbiseo-family-banner-pc-expanded.png");
    const banner = page.locator("[data-family-banner]");
    const box = await banner.boundingBox();
    if (box) {
      await shot(page, "ilbiseo-family-banner-pc.png", {
        x: Math.max(0, Math.floor(box.x - 8)),
        y: Math.max(0, Math.floor(box.y - 8)),
        width: Math.ceil(box.width + 16),
        height: Math.ceil(box.height + 16),
      });
    }
    await ctx.close();
  }

  // PC: 한 일 수정 button
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
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
    await page.locator("[data-family-banner]").waitFor({ state: "visible", timeout: 30000 });
    await page.addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important}",
    });
    // Desktop top nav (sm:grid); avoid fixed mobile bottom nav
    await page
      .locator('nav[aria-label="주요 메뉴"]:not(.fixed) button')
      .filter({ hasText: /^한 일/ })
      .click();
    await page.waitForTimeout(600);
    await page.locator("[data-excel-edit]").first().waitFor({ timeout: 10000 });

    // No 완료여부 header on done sheet
    const headers = await page.locator(".excel-wb thead th").allTextContents();
    console.log("done_headers", headers.map((h) => h.trim()).filter(Boolean));
    const hasDoneCol = headers.some((h) => h.includes("완료여부") || h.trim() === "완료");
    const hasEditCol = headers.some((h) => h.includes("수정"));
    console.log("has_완료여부", hasDoneCol, "has_수정", hasEditCol);

    const locked = await page.locator("[data-excel-row-locked='1']").count();
    console.log("locked_rows", locked);

    await shot(page, "ilbiseo-done-edit-locked.png");

    // Unlock first row
    await page.locator("[data-excel-edit]").first().click();
    await page.waitForTimeout(400);
    const editing = await page.locator("[data-excel-row-editing='1']").count();
    const editDoneBtn = await page.locator("[data-excel-edit-done]").count();
    console.log("editing_rows", editing, "수정끝_buttons", editDoneBtn);
    await shot(page, "ilbiseo-done-edit-unlocked.png");

    await ctx.close();
  }

  await browser.close();
  console.log("ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
