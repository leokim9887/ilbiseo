import { chromium } from "playwright";

const BASE =
  process.env.BASE_URL ||
  "https://temporary-fast-savanna-t2jdk9g.vercel.app";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
});
await page.goto(`${BASE}?view=calendar`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({
  path: `${OUT}/ilbiseo-gcal-oauth-configured.png`,
  fullPage: true,
});
const body = await page.locator("body").innerText();
console.log(
  JSON.stringify({
    hasConnectBtn: body.includes("Google 캘린더 연결"),
    hasMissingKey: body.includes("아직 Google 키가 없습니다"),
  }),
);
await browser.close();
