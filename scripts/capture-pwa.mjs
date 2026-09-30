import { chromium, devices } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Mobile Chrome — install hint + welcome + home-screen style
  const mobile = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ko-KR",
  });
  await mobile.addInitScript(() => {
    localStorage.removeItem("ilbiseo-install-dismissed");
    localStorage.removeItem("ilbiseo-welcome-seen");
  });
  const m = await mobile.newPage();
  await m.goto("http://127.0.0.1:4317/", { waitUntil: "domcontentloaded" });
  await m.getByText("일비서", { exact: true }).waitFor({ timeout: 30000 });
  await m.waitForTimeout(1500); // install hint delay
  await m.screenshot({
    path: path.join(OUT, "ilbiseo-pwa-install-hint-mobile.png"),
    fullPage: true,
  });

  // Dismiss welcome to show cleaner "app-like" grid with hint still up
  const start = m.getByRole("button", { name: "시작하기" });
  if (await start.isVisible().catch(() => false)) await start.click();
  await m.waitForTimeout(300);
  await m.screenshot({
    path: path.join(OUT, "ilbiseo-pwa-mobile-app-ui.png"),
    fullPage: true,
  });

  // Desktop install hint
  const desk = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  await desk.addInitScript(() => {
    localStorage.removeItem("ilbiseo-install-dismissed");
    localStorage.removeItem("ilbiseo-welcome-seen");
  });
  const d = await desk.newPage();
  await d.goto("http://127.0.0.1:4317/", { waitUntil: "domcontentloaded" });
  await d.getByText("일비서", { exact: true }).waitFor({ timeout: 30000 });
  await d.waitForTimeout(1500);
  await d.screenshot({
    path: path.join(OUT, "ilbiseo-pwa-install-hint-desktop.png"),
    fullPage: true,
  });

  // Manifest + SW sanity
  const man = await d.request.get("http://127.0.0.1:4317/manifest.webmanifest");
  const sw = await d.request.get("http://127.0.0.1:4317/sw.js");
  console.log("manifest", man.status(), "sw", sw.status());

  await browser.close();
  console.log(
    "Saved:",
    fs.readdirSync(OUT).filter((f) => f.includes("pwa")),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
