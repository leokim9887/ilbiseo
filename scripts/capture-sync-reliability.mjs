/**
 * Capture sync settings + success toast for father deliverable screenshots.
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { cheerDayIsoKst } from "../src/lib/date-range.ts";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4351";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

const cheerDay = cheerDayIsoKst();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 900 },
    locale: "ko-KR",
  });
  await ctx.addInitScript((day) => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-welcome-seen", "1");
    localStorage.setItem("ilbiseo-install-dismissed", String(Date.now()));
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
  }, cheerDay);

  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Safety: dismiss cheer if it still appears
  const cheerConfirm = page.locator("[data-daily-cheer-confirm]");
  if (await cheerConfirm.isVisible().catch(() => false)) {
    await cheerConfirm.click();
    await page.waitForTimeout(300);
  }

  await page.getByRole("button", { name: "설정" }).first().click({ force: true });
  await page.waitForTimeout(700);
  await page.getByText("PC ↔ 폰 동기화").waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: /새 코드 만들기/ }).click();
  await page.waitForTimeout(2000);
  await page.getByText("내 동기화 코드").waitFor({ timeout: 10000 });
  await page.getByText("PC ↔ 폰 동기화").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  await page.screenshot({
    path: path.join(OUT, "ilbiseo-sync-settings-pc.png"),
    fullPage: false,
  });

  await page.getByRole("button", { name: /지금 동기화/ }).click();
  const toast = page.locator('[role="status"]').filter({ hasText: /동기화|최신/ });
  await toast.first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(OUT, "ilbiseo-sync-toast-ok.png"),
    fullPage: false,
  });

  await browser.close();
  console.log("wrote", {
    settings: path.join(OUT, "ilbiseo-sync-settings-pc.png"),
    toast: path.join(OUT, "ilbiseo-sync-toast-ok.png"),
    cheerDay,
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
