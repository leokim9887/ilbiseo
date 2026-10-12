import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 900 },
    locale: "ko-KR",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("ilbiseo-welcome-seen", "1");
    localStorage.setItem("ilbiseo-install-dismissed", String(Date.now()));
  });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:4317/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "일비서" }).waitFor({ timeout: 30000 });

  await page.locator('button:has-text("설정")').first().click();
  await page.waitForTimeout(500);
  await page.getByText("PC ↔ 폰 동기화").waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(OUT, "pc-phone-sync-settings.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: /새 코드 만들기/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(OUT, "pc-phone-sync-code-created.png"),
    fullPage: true,
  });

  await browser.close();
  console.log("wrote screenshots to", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
