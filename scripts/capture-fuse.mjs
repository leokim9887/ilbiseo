import { chromium, devices } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });

  const mobile = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ko-KR",
  });
  await mobile.addInitScript(() => {
    localStorage.clear();
  });
  const m = await mobile.newPage();
  await m.goto("http://127.0.0.1:4317/", { waitUntil: "domcontentloaded" });
  await m.getByText("일비서", { exact: true }).first().waitFor({ timeout: 30000 });
  const startBtn = m.getByRole("button", { name: "시작하기" });
  if (await startBtn.isVisible().catch(() => false)) await startBtn.click();
  const close = m.getByRole("button", { name: "닫기" });
  if (await close.isVisible().catch(() => false)) await close.click();
  await m.waitForTimeout(500);

  await m.screenshot({
    path: path.join(OUT, "ilbiseo-fuse-4categories.png"),
    fullPage: true,
  });

  // scroll to checklist
  await m.getByText("체크리스트").first().scrollIntoViewIfNeeded();
  await m.waitForTimeout(200);
  await m.screenshot({
    path: path.join(OUT, "ilbiseo-fuse-checklist.png"),
    fullPage: true,
  });

  // calendar tab
  await m.getByRole("tab", { name: "구글 캘린더" }).click();
  await m.waitForTimeout(400);
  await m.screenshot({
    path: path.join(OUT, "ilbiseo-fuse-calendar-separate.png"),
    fullPage: true,
  });

  // briefing
  await m.getByRole("tab", { name: "오늘 브리핑" }).click();
  await m.waitForTimeout(400);
  await m.getByRole("button", { name: "지금 생성" }).click();
  await m.waitForTimeout(500);
  await m.screenshot({
    path: path.join(OUT, "ilbiseo-fuse-briefing-checklist.png"),
    fullPage: true,
  });

  // desktop: memo + excel
  const desk = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  await desk.addInitScript(() => {
    localStorage.clear();
  });
  const d = await desk.newPage();
  await d.goto("http://127.0.0.1:4317/", { waitUntil: "domcontentloaded" });
  await d.getByText("일비서", { exact: true }).first().waitFor({ timeout: 30000 });
  const s2 = d.getByRole("button", { name: "시작하기" });
  if (await s2.isVisible().catch(() => false)) await s2.click();
  const c2 = d.getByRole("button", { name: "닫기" });
  if (await c2.isVisible().catch(() => false)) await c2.click();
  await d.waitForTimeout(400);

  await d.screenshot({
    path: path.join(OUT, "ilbiseo-fuse-memo-excel.png"),
    fullPage: true,
  });

  // personal category
  await d.getByRole("button", { name: "개인용" }).click();
  await d.waitForTimeout(300);
  await d.screenshot({
    path: path.join(OUT, "ilbiseo-fuse-category-personal.png"),
    fullPage: true,
  });

  await browser.close();
  console.log(
    "Saved:",
    fs.readdirSync(OUT).filter((f) => f.includes("fuse")),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
