import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = "http://127.0.0.1:4331/";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const now = "2026-10-10T00:00:00.000Z";
const SEED = {
  version: 3,
  tasks: [{
    id: "t1", title: "헤드헌팅 후보 리스트 정리", memo: "A급",
    category: "work", kind: "spot", importance: 3, urgency: 2,
    startDate: "2026-10-12", targetDate: "2026-10-15", groupKey: "헤드헌팅",
    source: "manual", status: "active", completedAt: null, createdAt: now,
  }],
  checklists: [], guidelines: [], habits: [], calendarEvents: [],
  excelLink: null, emailBriefing: null, updatedAt: now,
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  await ctx.addInitScript((payload) => {
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
    localStorage.removeItem("ilbiseo-daily-cheer-kst");
    localStorage.setItem("ilbiseo-daily-cheer-idx", "2");
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  }, SEED);
  const page = await ctx.newPage();
  page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const dump = await page.evaluate(() => ({
    cheerKey: localStorage.getItem("ilbiseo-daily-cheer-kst"),
    cheerIdx: localStorage.getItem("ilbiseo-daily-cheer-idx"),
    welcome: localStorage.getItem("ilbiseo-welcome-seen-v2"),
    html: !!document.querySelector("[data-daily-cheer]"),
    bodySnippet: document.body?.innerText?.slice(0, 200),
  }));
  console.log("dump", dump);
  // Force-clear and reload if needed
  if (!dump.html) {
    await page.evaluate(() => localStorage.removeItem("ilbiseo-daily-cheer-kst"));
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    console.log("after reload", await page.evaluate(() => !!document.querySelector("[data-daily-cheer]")));
  }
  await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 15000 });
  const src = await page.locator("[data-daily-cheer-face]").getAttribute("src");
  console.log("cheer_src", src);
  const name = "ilbiseo-cheer-ace-original.png";
  const p1 = path.join(OUT, name);
  await page.screenshot({ path: p1 });
  fs.copyFileSync(p1, path.join(ART, name));
  console.log("wrote", p1);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
