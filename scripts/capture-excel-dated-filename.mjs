/**
 * Capture Excel settings / workbook showing dated filename pattern.
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { cheerDayIsoKst } from "../src/lib/date-range.ts";
import { datedExcelFilename } from "../src/lib/excel-filename.ts";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4351";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

const cheerDay = cheerDayIsoKst();
const expected = datedExcelFilename();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 900 },
    locale: "ko-KR",
  });
  await ctx.addInitScript((day) => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed", String(Date.now()));
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
  }, cheerDay);

  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Workbook header should show dated name
  await page.getByText(expected).first().waitFor({ timeout: 15000 });

  await page.getByRole("button", { name: "설정" }).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.getByText("엑셀 파일 저장").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  await page.screenshot({
    path: path.join(OUT, "ilbiseo-excel-dated-filename.png"),
    fullPage: false,
  });

  await browser.close();
  console.log("wrote", {
    file: path.join(OUT, "ilbiseo-excel-dated-filename.png"),
    expected,
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
