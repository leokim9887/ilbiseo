import { chromium, devices } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Mobile
  const mobile = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ko-KR",
  });
  await mobile.addInitScript(() => localStorage.clear());
  const m = await mobile.newPage();
  await m.goto("http://127.0.0.1:4317/", { waitUntil: "domcontentloaded" });
  await m.getByText("일비서", { exact: true }).first().waitFor({ timeout: 30000 });
  for (const name of ["시작하기", "닫기"]) {
    const b = m.getByRole("button", { name });
    if (await b.isVisible().catch(() => false)) await b.click();
  }
  await m.waitForTimeout(600);
  await m.screenshot({
    path: path.join(OUT, "ilbiseo-todo-ui-mobile.png"),
    fullPage: true,
  });

  // Expand first card edit
  const expand = m.getByRole("button", { name: "자세히 편집" }).first();
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await m.waitForTimeout(300);
    await m.screenshot({
      path: path.join(OUT, "ilbiseo-todo-ui-mobile-edit.png"),
      fullPage: true,
    });
  }

  // Desktop
  const desk = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  await desk.addInitScript(() => localStorage.clear());
  const d = await desk.newPage();
  await d.goto("http://127.0.0.1:4317/", { waitUntil: "domcontentloaded" });
  await d.getByText("일비서", { exact: true }).first().waitFor({ timeout: 30000 });
  for (const name of ["시작하기", "닫기"]) {
    const b = d.getByRole("button", { name });
    if (await b.isVisible().catch(() => false)) await b.click();
  }
  await d.waitForTimeout(500);
  await d.screenshot({
    path: path.join(OUT, "ilbiseo-todo-ui-desktop.png"),
    fullPage: true,
  });

  await browser.close();
  console.log(
    "Saved:",
    fs.readdirSync(OUT).filter((f) => f.startsWith("ilbiseo-todo-ui-")),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
