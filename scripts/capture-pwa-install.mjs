import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

async function shot(name, contextOptions, pathHint) {
  const browser = await chromium.launch();
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.removeItem("ilbiseo-install-dismissed");
    localStorage.removeItem("ilbiseo-install-dismissed-v2");
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200); // install banner delay
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
  const body = await page.locator("body").innerText();
  console.log(JSON.stringify({ name, hasInstall: /앱 설치|홈 화면|지금 설치|Windows|Safari|안드로이드/.test(body), pathHint }));
  await browser.close();
}

await shot(
  "ilbiseo-pwa-install-desktop.png",
  {
    viewport: { width: 1360, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
  "win",
);

await shot(
  "ilbiseo-pwa-install-android.png",
  {
    ...devices["Pixel 7"],
  },
  "android",
);

await shot(
  "ilbiseo-pwa-install-iphone.png",
  {
    ...devices["iPhone 13"],
  },
  "ios",
);

// settings install section
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
  localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
});
await page.goto(`${BASE}?view=settings`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/ilbiseo-pwa-install-settings.png`, fullPage: true });
const body = await page.locator("body").innerText();
console.log(JSON.stringify({ settingsHasGuide: body.includes("앱처럼 설치하기") }));
await browser.close();
