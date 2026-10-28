import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE:", m.text());
  });

  await page.goto("http://127.0.0.1:4317/", { waitUntil: "domcontentloaded" });
  await page.getByText("일비서", { exact: true }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-todo-desktop.png"),
    fullPage: true,
  });

  await page.locator("[data-excel-import]").first().click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-excel-import-dialog.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-todo-mobile.png"),
    fullPage: true,
  });

  await browser.close();
  console.log(
    "Saved:",
    fs.readdirSync(OUT).filter((f) => f.startsWith("ilbiseo-")),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
