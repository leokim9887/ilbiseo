/**
 * Screenshots: 할 일 / 한 일 without 시급성 column + briefing preview.
 * Excel headers written via smoke-alert-briefing-excel-lib.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Seoul",
});

async function dismissOverlays(page) {
  const cheer = page.locator("[data-daily-cheer-confirm]");
  if (await cheer.count()) {
    try {
      await cheer.first().click({ timeout: 2000 });
      await page.waitForTimeout(300);
    } catch {
      /* ignore */
    }
  }
  for (const name of [/시작하기/, /알겠어요/, /확인/, /닫기/]) {
    const btn = page.getByRole("button", { name });
    if (await btn.count()) {
      try {
        await btn.first().click({ timeout: 1200 });
        await page.waitForTimeout(200);
      } catch {
        /* ignore */
      }
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((day) => {
    const now = new Date().toISOString();
    const tasks = [
      {
        id: "u1",
        title: "보고서 마감",
        category: "work",
        kind: "spot",
        startDate: day,
        targetDate: day,
        urgency: 3,
        importance: 3,
        groupKey: "보고서",
        memo: "시급성 열 없음 확인",
        source: "manual",
        status: "active",
        createdAt: now,
        completedAt: null,
      },
      {
        id: "u2",
        title: "장보기",
        category: "personal",
        kind: "someday",
        startDate: null,
        targetDate: null,
        urgency: 1,
        importance: 2,
        groupKey: "장보기",
        memo: "",
        source: "manual",
        status: "active",
        createdAt: now,
        completedAt: null,
      },
      {
        id: "u3",
        title: "완료된 일",
        category: "work",
        kind: "spot",
        startDate: day,
        targetDate: day,
        urgency: 2,
        importance: 2,
        groupKey: "완료",
        memo: "",
        source: "manual",
        status: "completed",
        createdAt: now,
        completedAt: now,
      },
    ];
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
    localStorage.setItem(
      "ilbiseo-state-v2",
      JSON.stringify({
        version: 2,
        tasks,
        guidelines: [],
        habits: [],
        calendarEvents: [],
      }),
    );
  }, today);
  await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
  await dismissOverlays(page);
  await page.waitForTimeout(500);

  const headers = await page.locator("thead th").allTextContents();
  const joined = headers.map((s) => s.replace(/\s+/g, " ").trim()).join(" | ");
  if (/시급/.test(joined)) {
    throw new Error(`시급 header still present: ${joined}`);
  }
  if (!/중요/.test(joined)) {
    throw new Error(`중요 header missing: ${joined}`);
  }
  fs.writeFileSync(
    path.join(OUT, "ilbiseo-todo-headers-no-urgency.txt"),
    joined + "\n",
  );

  const wb = page.locator(".excel-wb");
  await wb.screenshot({
    path: path.join(OUT, "ilbiseo-todo-no-urgency.png"),
  });
  console.log("wrote ilbiseo-todo-no-urgency.png", joined);

  await page.getByRole("button", { name: /^한 일/ }).first().click();
  await page.waitForTimeout(400);
  await wb.screenshot({
    path: path.join(OUT, "ilbiseo-done-no-urgency.png"),
  });
  console.log("wrote ilbiseo-done-no-urgency.png");

  // 오늘 브리핑 nav
  const briefingNav = page.getByRole("button", { name: /브리핑/ });
  if (await briefingNav.count()) {
    await briefingNav.first().click();
    await page.waitForTimeout(600);
  }
  await dismissOverlays(page);
  const panel = page.locator("text=【할 일】").first();
  if (await panel.count()) {
    const section = panel.locator("xpath=ancestor::*[contains(@class,'divide-y') or self::section][1]");
    if (await section.count()) {
      await section.screenshot({
        path: path.join(OUT, "ilbiseo-briefing-no-urgency.png"),
      });
    } else {
      await page.screenshot({
        path: path.join(OUT, "ilbiseo-briefing-no-urgency.png"),
      });
    }
  } else {
    await page.screenshot({
      path: path.join(OUT, "ilbiseo-briefing-no-urgency.png"),
    });
  }
  console.log("wrote ilbiseo-briefing-no-urgency.png");

  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
