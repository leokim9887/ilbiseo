/**
 * Capture Ace daily cheer overlay — PC + mobile (dramatic TEMP QA build).
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

async function seed(context) {
  await context.addInitScript((payload) => {
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
    localStorage.removeItem("ilbiseo-daily-cheer-kst");
    localStorage.setItem("ilbiseo-daily-cheer-idx", "0");
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  }, SEED);
}

async function shot(page, name) {
  const p1 = path.join(OUT, name);
  // Wait for entrance animations to settle
  await page.waitForTimeout(900);
  await page.screenshot({ path: p1, fullPage: false });
  fs.copyFileSync(p1, path.join(ART, name));
  console.log("wrote", p1);
}

async function assertCheer(page, label) {
  await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 15000 });
  const btn = (await page.locator("[data-daily-cheer-confirm]").innerText()).trim();
  const bubble = (await page.locator("[data-daily-cheer-bubble]").innerText()).trim();
  const src = await page.locator("[data-daily-cheer-face]").getAttribute("src");
  console.log(label, { btn, bubble, src });
  if (btn !== "시작") throw new Error(`${label}: button not 시작`);
  if (!bubble) throw new Error(`${label}: empty bubble`);
  if (!src?.includes("ilbiseo-grandson-cheer.jpg")) {
    throw new Error(`${label}: wrong face asset ${src}`);
  }
  // Reload once — TEMP every-refresh must show again
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 15000 });
  console.log(label, "reload-ok");
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 980 },
      deviceScaleFactor: 1,
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await assertCheer(page, "pc");
    await shot(page, "ilbiseo-ace-cheer-dramatic-pc.png");
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await assertCheer(page, "mobile");
    await shot(page, "ilbiseo-ace-cheer-dramatic-mobile.png");
    await ctx.close();
  }

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
