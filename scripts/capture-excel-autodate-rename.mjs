/**
 * Capture workbook header showing today’s dated Excel filename.
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4351";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

function todayIsoKst(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const expected = `일비서_${todayIsoKst()}.xlsx`;
const cheerDay = todayIsoKst();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 780 },
    locale: "ko-KR",
  });
  await ctx.addInitScript((day) => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed", String(Date.now()));
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
  }, cheerDay);

  const page = await ctx.newPage();
  await page.goto(BASE + "/?view=todo", { waitUntil: "networkidle" });
  await page.getByText(expected).first().waitFor({ timeout: 20000 });
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-excel-autodate-rename.png"),
    fullPage: false,
  });

  await page.getByRole("button", { name: "설정" }).first().click({ force: true });
  await page.waitForTimeout(600);
  await page.getByText("엑셀 파일 저장").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  // Prefer settings crop if copy visible; primary deliverable is workbook name shot above.
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-excel-autodate-rename-settings.png"),
    fullPage: false,
  });

  await browser.close();
  console.log("wrote", { expected, out: OUT });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
