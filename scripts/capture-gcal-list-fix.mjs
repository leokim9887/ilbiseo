import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "https://temporary-swift-xenon-3xupzi9.vercel.app";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.setItem("ilbiseo-welcome-seen-v2", "1"));
await page.goto(`${BASE}?view=calendar`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/ilbiseo-gcal-list-fix.png`, fullPage: true });
const body = await page.locator("body").innerText();
console.log(JSON.stringify({
  hasConnect: body.includes("Google 캘린더 연결"),
  hasConfigured: body.includes("Google 설정은 되어 있습니다"),
  hasHtml404: body.includes("Error 404") || body.includes("<!DOCTYPE"),
  icsOptional: body.includes("선택"),
}));
await browser.close();
