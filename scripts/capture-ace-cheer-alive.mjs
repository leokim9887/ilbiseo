/**
 * Capture Ace "alive" cheer overlay — PC + mobile + short motion webm.
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

async function save(srcPath, name) {
  const p1 = path.join(OUT, name);
  fs.copyFileSync(srcPath, p1);
  fs.copyFileSync(p1, path.join(ART, name));
  console.log("wrote", p1);
  return p1;
}

async function assertAlive(page, label) {
  await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 15000 });
  const btn = (await page.locator("[data-daily-cheer-confirm]").innerText()).trim();
  const bubble = (await page.locator("[data-daily-cheer-bubble]").innerText()).trim();
  const src = await page.locator("[data-daily-cheer-face]").getAttribute("src");
  const box = await page.locator("[data-daily-cheer-face]").boundingBox();
  const stage = await page.locator(".cheer-portrait").boundingBox();
  console.log(label, { btn, bubble, src, faceW: box?.width, stageW: stage?.width });
  if (btn !== "시작") throw new Error(`${label}: button not 시작`);
  if (!bubble) throw new Error(`${label}: empty bubble`);
  if (!src?.includes("ilbiseo-grandson-cheer.png")) {
    throw new Error(`${label}: wrong face asset ${src}`);
  }
  // Face should dominate — roughly as wide as the portrait stage
  if (!box || !stage || box.width < stage.width * 0.85) {
    throw new Error(
      `${label}: face not dominant (face=${box?.width} stage=${stage?.width})`,
    );
  }
  // No cream dialog chrome text leftover
  const text = await page.locator("[data-daily-cheer]").innerText();
  if (text.includes("에이스의 응원")) {
    console.log(label, "note: label present (ok if removed)");
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // PC screenshot
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 980 },
      deviceScaleFactor: 1,
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await assertAlive(page, "pc");
    await page.waitForTimeout(1100);
    const tmp = path.join(ART, "_tmp-alive-pc.png");
    await page.screenshot({ path: tmp, fullPage: false });
    await save(tmp, "ilbiseo-ace-cheer-alive-pc.png");
    await ctx.close();
  }

  // Mobile screenshot
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
    await assertAlive(page, "mobile");
    await page.waitForTimeout(1100);
    const tmp = path.join(ART, "_tmp-alive-mobile.png");
    await page.screenshot({ path: tmp, fullPage: false });
    await save(tmp, "ilbiseo-ace-cheer-alive-mobile.png");
    await ctx.close();
  }

  // Short motion recording (webm) — optional proof of breath/glow
  {
    const ctx = await browser.newContext({
      viewport: { width: 900, height: 900 },
      deviceScaleFactor: 1,
      recordVideo: { dir: ART, size: { width: 900, height: 900 } },
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(4200);
    await ctx.close();
    const vids = fs
      .readdirSync(ART)
      .filter((f) => f.endsWith(".webm"))
      .map((f) => ({ f, m: fs.statSync(path.join(ART, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (vids[0]) {
      const src = path.join(ART, vids[0].f);
      await save(src, "ilbiseo-ace-cheer-alive-motion.webm");
    } else {
      console.log("no webm produced");
    }
  }

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
