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

  await page.getByRole("button", { name: "메모 붙여넣기" }).click();
  await page.locator("#memo-text").waitFor();
  await page.fill(
    "#memo-text",
    "오늘 후보자 전화 확인\nJD 수정 — 이번 주\n언젠가 사무실 정리",
  );
  await page.getByRole("button", { name: "할 일로 추가" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-after-memo-import.png"),
    fullPage: true,
  });

  await page.locator('[data-slot="checkbox"]').first().click();
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: /완료 기록/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-completion-log.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: /TO DO/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "캘린더 가져오기" }).click();
  await page.getByRole("button", { name: "mock JSON 불러오기" }).click();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-calendar-dialog.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "일정 반영" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-after-calendar.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-todo-mobile.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "사진 OCR" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT, "ilbiseo-ocr-dialog.png"),
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
