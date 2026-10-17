import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = "http://127.0.0.1:4332/";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const SEED = {
  version: 3,
  tasks: [{
    id: "t1", title: "헤드헌팅 후보 리스트 정리", memo: "A급",
    category: "work", kind: "spot", importance: 3, urgency: 2,
    startDate: "2026-10-12", targetDate: "2026-10-15", groupKey: "헤드헌팅",
    source: "manual", status: "active", completedAt: null, createdAt: "2026-10-10T00:00:00.000Z",
  }],
  checklists: [], guidelines: [], habits: [], calendarEvents: [],
  excelLink: null, emailBriefing: null, updatedAt: "2026-10-10T00:00:00.000Z",
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  await ctx.addInitScript((payload) => {
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    let y = Number(get("year")), m = Number(get("month")), d = Number(get("day"));
    const hour = Number(get("hour"));
    if (hour < 7) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 1);
      y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    }
    localStorage.setItem("ilbiseo-daily-cheer-kst", `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  }, SEED);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("[data-family-banner]", { timeout: 30000 });
  const cheer = page.locator("[data-daily-cheer-confirm]");
  if (await cheer.count()) { await cheer.click(); await page.waitForTimeout(300); }
  const box = await page.locator("[data-family-banner]").boundingBox();
  const name = "ilbiseo-banner-ace-face-pc.png";
  const p1 = path.join(OUT, name);
  await page.screenshot({ path: p1, clip: box });
  fs.copyFileSync(p1, path.join(ART, name));
  console.log("wrote", p1);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
