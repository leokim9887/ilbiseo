/**
 * Prove FORCE_CHEER_EVERY_LOAD=false: cheer once, then not again after dismiss+reload.
 */
import { chromium } from "playwright";

const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4331/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  // Seed once before first navigation — do NOT clear cheer key on reload
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.removeItem("ilbiseo-daily-cheer-kst");
    localStorage.setItem("ilbiseo-daily-cheer-idx", "0");
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 12000 });
  console.log("first-load: cheer visible");
  await page.locator("[data-daily-cheer-confirm]").click();
  await page.locator("[data-daily-cheer]").waitFor({ state: "hidden", timeout: 8000 });
  const dayKey = await page.evaluate(() => localStorage.getItem("ilbiseo-daily-cheer-kst"));
  console.log("after dismiss: dayKey=", dayKey);
  if (!dayKey) throw new Error("expected cheer day key written");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const still = await page.locator("[data-daily-cheer]").count();
  console.log("after reload: cheer count=", still);
  if (still !== 0) throw new Error("cheer still showing after reload — TEMP gate not restored");

  // Optional screenshot of clean app (no overlay)
  const out = "/cursor/stores/self/media/ilbiseo-ace-cheer-gate-restored.png";
  await page.screenshot({ path: out, fullPage: false });
  console.log("wrote", out);
  await browser.close();
  console.log("PASS: 07:00 day gate restored");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
