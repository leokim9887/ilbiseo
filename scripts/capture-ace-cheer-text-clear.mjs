/**
 * Verify cheer bubble never overlaps Ace face; capture mobile screenshot.
 * Tests short + long phrases; asserts gap between face frame and bubble.
 */
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

const SHORT = "에이스 응원 도착! 할아버지, 화이팅!";
const LONG =
  "씩씩한 할아버지! 에이스가 옆에서 응원할게요. 오늘도 건강하게 화이팅!";

async function seed(context, message) {
  await context.addInitScript(
    ({ payload, message: msg }) => {
      localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
      localStorage.removeItem("ilbiseo-daily-cheer-kst");
      localStorage.setItem("ilbiseo-daily-cheer-idx", "0");
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
      // Force phrase via storage idx alone isn't enough — inject after mount:
      window.__CHEER_FORCE_MSG = msg;
    },
    { payload: SEED, message },
  );
}

async function assertClearance(page, label) {
  await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 15000 });
  // Override visible message for short/long coverage
  const forced = await page.evaluate(() => window.__CHEER_FORCE_MSG || null);
  if (forced) {
    await page.locator("[data-daily-cheer-bubble] p").evaluate((el, text) => {
      el.textContent = text;
    }, forced);
  }
  await page.waitForTimeout(400);

  const face = await page.locator("[data-daily-cheer-face]").boundingBox();
  const frame = await page.locator(".cheer-face-frame").boundingBox();
  const bubble = await page.locator("[data-daily-cheer-bubble]").boundingBox();
  const stage = await page.locator(".cheer-stage").boundingBox();
  if (!face || !frame || !bubble || !stage) {
    throw new Error(`${label}: missing boxes`);
  }

  const gap = bubble.y - (frame.y + frame.height);
  const overlapY = Math.min(frame.y + frame.height, bubble.y + bubble.height) - Math.max(frame.y, bubble.y);
  console.log(label, {
    faceH: Math.round(face.height),
    frameBottom: Math.round(frame.y + frame.height),
    bubbleTop: Math.round(bubble.y),
    gap: Math.round(gap),
    overlapY: Math.round(overlapY),
    bubbleText: (await page.locator("[data-daily-cheer-bubble]").innerText()).trim(),
    stageCy: Math.round(stage.y + stage.height / 2),
  });

  if (gap < 8) {
    throw new Error(`${label}: insufficient clearance gap=${gap}px (need ≥8)`);
  }
  if (overlapY > 0) {
    throw new Error(`${label}: bubble overlaps face frame by ${overlapY}px`);
  }
  // Bubble must be entirely below the circular face
  if (bubble.y < frame.y + frame.height) {
    throw new Error(`${label}: bubble top still inside face vertical range`);
  }
}

async function shot(page, name) {
  const tmp = path.join(ART, `_tmp-${name}`);
  await page.screenshot({ path: tmp, fullPage: false });
  const out = path.join(OUT, name);
  fs.copyFileSync(tmp, out);
  fs.copyFileSync(out, path.join(ART, name));
  console.log("wrote", out);
}

async function openMobile(browser, message) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await seed(ctx, message);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  return { ctx, page };
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Short phrase — primary deliverable screenshot
  {
    const { ctx, page } = await openMobile(browser, SHORT);
    await assertClearance(page, "mobile-short");
    await page.waitForTimeout(700);
    await shot(page, "ilbiseo-ace-cheer-text-clear.png");
    await ctx.close();
  }

  // Long phrase — must still clear the face
  {
    const { ctx, page } = await openMobile(browser, LONG);
    await assertClearance(page, "mobile-long");
    await page.waitForTimeout(400);
    await shot(page, "ilbiseo-ace-cheer-text-clear-long.png");
    await ctx.close();
  }

  // Desktop short — also clear
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });
    await seed(ctx, SHORT);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await assertClearance(page, "desktop-short");
    await ctx.close();
  }

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
