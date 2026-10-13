import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4330/";
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

async function seed(context, { cheerIdx = 0 } = {}) {
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

async function assertCheerClean(page, label) {
  const text = await page.locator("[data-daily-cheer]").innerText();
  const btn = await page.locator("[data-daily-cheer-confirm]").innerText();
  console.log(label, "btn=", JSON.stringify(btn), "snippet=", JSON.stringify(text.slice(0, 120)));
  if (text.includes("손자")) throw new Error(`${label}: still has 손자`);
  if (text.includes("손자 응원 · 오늘 한 번")) throw new Error(`${label}: top label present`);
  if (text.includes("언제나 화이팅입니다!")) throw new Error(`${label}: bottom motto present`);
  if (btn.trim() !== "시작") throw new Error(`${label}: button is not 시작 (${btn})`);
  const bubble = (await page.locator("[data-daily-cheer-bubble]").innerText()).trim();
  if (!bubble) throw new Error(`${label}: empty cheer message`);
  return bubble;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const bubbles = [];

  // PC cheer + banner
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 980 },
    });
    await seed(ctx, { cheerIdx: 2 }); // 에이스가 응원해요…
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(500);
    bubbles.push(await assertCheerClean(page, "pc"));
    await shot(page, "ilbiseo-ace-cheer-overlay-pc.png");
    await page.locator("[data-daily-cheer-confirm]").click();
    await page.waitForTimeout(400);
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) await shot(page, "ilbiseo-pc-banner-edge-polish.png", box);
    await shot(page, "ilbiseo-pc-banner-edge-polish-full.png");
    await ctx.close();
  }

  // Mobile cheer
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await seed(ctx, { cheerIdx: 10 }); // 에이스 응원 도착!
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(500);
    bubbles.push(await assertCheerClean(page, "mobile"));
    await shot(page, "ilbiseo-ace-cheer-overlay-mobile.png");
    await ctx.close();
  }

  // Rotation across two fresh daily opens (different idx → different bubble)
  {
    const msgs = [];
    for (const idx of [0, 1]) {
      const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
      await seed(ctx, { cheerIdx: idx });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
      await page.locator("[data-daily-cheer-bubble]").waitFor({ state: "visible", timeout: 30000 });
      msgs.push((await page.locator("[data-daily-cheer-bubble]").innerText()).trim());
      await ctx.close();
    }
    console.log("rotation_msgs", msgs);
    if (msgs[0] === msgs[1]) throw new Error("rotation failed: same message for idx 0 and 1");
    console.log("rotation_verified OK");
  }

  console.log("bubbles", bubbles);
  await browser.close();
  console.log("capture done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
