import { chromium, devices } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ko-KR",
  });
  await context.addInitScript(() => {
    localStorage.removeItem("ilbiseo-install-dismissed");
    localStorage.setItem("ilbiseo-welcome-seen", "1");
    localStorage.removeItem("ilbiseo-install-dismissed");
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4317/", { waitUntil: "domcontentloaded" });
  await page.getByText("일비서", { exact: true }).first().waitFor({ timeout: 30000 });
  // dismiss install if visible
  const close = page.getByRole("button", { name: "닫기" });
  if (await close.isVisible().catch(() => false)) await close.click();

  await page.getByRole("tab", { name: "오늘 브리핑" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "지금 생성" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-briefing-preview.png"),
    fullPage: true,
  });

  // Desktop briefing
  const desk = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  await desk.addInitScript(() => {
    localStorage.setItem("ilbiseo-welcome-seen", "1");
    localStorage.setItem("ilbiseo-install-dismissed", "1");
  });
  const d = await desk.newPage();
  await d.goto("http://127.0.0.1:4317/", { waitUntil: "domcontentloaded" });
  await d.getByText("일비서", { exact: true }).first().waitFor({ timeout: 30000 });
  await d.getByRole("tab", { name: "오늘 브리핑" }).click();
  await d.waitForTimeout(400);
  await d.getByRole("button", { name: "지금 생성" }).click();
  await d.waitForTimeout(400);
  await d.screenshot({
    path: path.join(OUT, "ilbiseo-briefing-desktop.png"),
    fullPage: true,
  });

  // Excel download via in-page export
  const [download] = await Promise.all([
    d.waitForEvent("download", { timeout: 15000 }),
    d.getByRole("button", { name: "엑셀 저장" }).click(),
  ]);
  const xlsxPath = path.join(OUT, "ilbiseo-excel-briefing.xlsx");
  await download.saveAs(xlsxPath);
  console.log("xlsx", xlsxPath, fs.statSync(xlsxPath).size);

  // Screenshot of briefing panel with excel button area after export
  await d.waitForTimeout(300);
  await d.screenshot({
    path: path.join(OUT, "ilbiseo-excel-export-ui.png"),
    fullPage: true,
  });

  // API dry-run note
  await d.getByRole("button", { name: "API dry-run" }).click();
  await d.waitForTimeout(800);
  await d.screenshot({
    path: path.join(OUT, "ilbiseo-briefing-api-dryrun.png"),
    fullPage: true,
  });

  await browser.close();
  console.log(
    "Saved:",
    fs.readdirSync(OUT).filter((f) => f.includes("briefing") || f.includes("excel")),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
