import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4332/";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const now = "2026-10-10T00:00:00.000Z";
const SEED = {
  version: 3,
  tasks: [{ id: "t1", title: "테스트", memo: "", category: "work", kind: "spot", importance: 3, urgency: 2, startDate: "2026-10-12", targetDate: "2026-10-15", groupKey: "", source: "manual", status: "active", completedAt: null, createdAt: now }],
  checklists: [], guidelines: [], habits: [], calendarEvents: [], excelLink: null, emailBriefing: null, updatedAt: now,
};

function cheerInit() {
  return `(() => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    let y = Number(get("year")), m = Number(get("month")), d = Number(get("day"));
    if (Number(get("hour")) < 7) { const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - 1); y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); }
    localStorage.setItem("ilbiseo-daily-cheer-kst", \`\${y}-\${String(m).padStart(2, "0")}-\${String(d).padStart(2, "0")}\`);
  })()`;
}

async function seed(ctx) {
  await ctx.addInitScript((payload) => {
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  }, SEED);
  await ctx.addInitScript(cheerInit());
}

async function shot(page, name, clip) {
  const p1 = path.join(OUT, name);
  await page.screenshot({ path: p1, clip });
  fs.copyFileSync(p1, path.join(ART, name));
  console.log("wrote", p1, fs.statSync(p1).size);
}

async function dismiss(page) {
  if (await page.locator("[data-daily-cheer]").count()) {
    const btn = page.locator("[data-daily-cheer-confirm]");
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("[data-family-banner]", { timeout: 30000 });
    await dismiss(page);
    await page.waitForTimeout(500);
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) await shot(page, "ilbiseo-banner-dog-nudge-pc.png", box);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("[data-family-banner]", { timeout: 30000 });
    await dismiss(page);
    await page.waitForTimeout(500);
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) await shot(page, "ilbiseo-banner-dog-nudge-mobile.png", box);
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
