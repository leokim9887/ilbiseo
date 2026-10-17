/**
 * Capture follow-up Excel import UI (allowlist, dark, guide/habit, similarity, deadline).
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import ExcelJS from "exceljs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4331";
const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

function cheerDayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date());
  const pick = (t) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = Number.parseInt(pick("hour"), 10);
  if (hour === 24) hour = 0;
  let day = `${pick("year")}-${pick("month")}-${pick("day")}`;
  if (!Number.isFinite(hour) || hour < 7) {
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  return day;
}

async function buildFixture() {
  const wb = new ExcelJS.Workbook();
  const todo = wb.addWorksheet("할 일");
  todo.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
  todo.addRow([
    1,
    "업무용",
    "병원 진료 예약 점검",
    "2026-10-17 ~ 2026-10-20",
    3,
  ]);
  const r2 = todo.addRow([
    2,
    "개인용",
    "세금 신고 준비",
    new Date(Date.UTC(2026, 10, 5)),
    2,
  ]);
  r2.getCell(4).numFmt = "yyyy-mm-dd";
  todo.addRow([3, "과제용", "책 정리하기", "언젠가", 1]);
  // distractor sheets (must NOT appear in picker)
  wb.addWorksheet("한 일").addRow(["x"]);
  wb.addWorksheet("구글캘린더").addRow(["x"]);
  const guide = wb.addWorksheet("지침");
  guide.addRow(["순서", "내용", "메모", "완료"]);
  guide.addRow([1, "아침 스트레칭", "", ""]);
  guide.addRow([2, "병원 진료 예약 확인", "동일문구테스트", ""]);
  const habit = wb.addWorksheet("습관");
  habit.addRow(["순서", "내용", "메모", "완료"]);
  habit.addRow([1, "물 마시기", "하루 8잔", ""]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const p = path.join(OUT, "ilbiseo-excel-import-followups-fixture.xlsx");
  fs.writeFileSync(p, buf);
  return p;
}

async function seedContext(context, { dark = false } = {}) {
  const key = cheerDayKey();
  await context.addInitScript(
    ({ dayKey, darkMode }) => {
      localStorage.setItem("ilbiseo-daily-cheer-kst", dayKey);
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
      if (darkMode) localStorage.setItem("ilbiseo-theme", "dark");
      else localStorage.removeItem("ilbiseo-theme");
      const now = new Date().toISOString();
      localStorage.setItem(
        "ilbiseo-state-v2",
        JSON.stringify({
          version: 3,
          tasks: [
            {
              id: "seed-dupe",
              title: "병원 진료 예약 확인",
              category: "work",
              kind: "spot",
              startDate: "2026-10-18",
              targetDate: "2026-10-18",
              urgency: 1,
              importance: 2,
              groupKey: "병원",
              memo: "",
              source: "manual",
              status: "active",
              createdAt: now,
              completedAt: null,
            },
            {
              id: "seed-exact",
              title: "세금 신고 준비",
              category: "personal",
              kind: "spot",
              startDate: "2026-11-05",
              targetDate: "2026-11-05",
              urgency: 1,
              importance: 2,
              groupKey: "세금",
              memo: "",
              source: "manual",
              status: "active",
              createdAt: now,
              completedAt: null,
            },
          ],
          checklists: [],
          calendarEvents: [],
          guidelines: [
            {
              id: "g1",
              title: "기존 지침",
              memo: "",
              done: false,
              createdAt: now,
              completedAt: null,
            },
          ],
          habits: [],
        }),
      );
      // Force dark class early if needed
      if (darkMode) {
        document.documentElement.classList.add("dark");
      }
    },
    { dayKey: key, darkMode: dark },
  );
}

async function dismissCheer(page) {
  const cheer = page.locator("[data-daily-cheer]");
  if ((await cheer.count()) > 0) {
    await page.locator("[data-daily-cheer-confirm]").click({ force: true });
    await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  }
}

async function openImport(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await dismissCheer(page);
  // Welcome / install overlays
  for (const sel of [
    'button:has-text("시작하기")',
    'button:has-text("닫기")',
    "[data-install-dismiss]",
  ]) {
    const b = page.locator(sel);
    if ((await b.count()) > 0) {
      await b.first().click({ force: true }).catch(() => {});
    }
  }
  await page.locator("[data-toolbar-extras]").waitFor({ timeout: 15000 });
  await page.locator("[data-toolbar-extras]").click();
  await page.locator("[data-toolbar-extras-excel]").click();
  await page.waitForSelector('[role="dialog"]');
}

async function pickFile(page, fixture) {
  await page.locator('input[type="file"]').setInputFiles(fixture);
}

async function main() {
  const fixture = await buildFixture();
  const browser = await chromium.launch({ headless: true });

  // 1) Allowlist sheet picker (light)
  {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      locale: "ko-KR",
    });
    await seedContext(ctx, { dark: false });
    const page = await ctx.newPage();
    await openImport(page);
    await pickFile(page, fixture);
    await page.waitForSelector("[data-excel-import-sheet-select]", {
      timeout: 8000,
    });
    const options = await page
      .locator("[data-excel-import-sheet-select] option")
      .allTextContents();
    if (options.some((o) => o.includes("한 일") || o.includes("구글"))) {
      throw new Error("allowlist failed: " + options.join("|"));
    }
    await page
      .locator('[role="dialog"]')
      .screenshot({
        path: path.join(OUT, "ilbiseo-excel-import-sheets-allowlist.png"),
      });
    await ctx.close();
  }

  // 2) Dark mode sheet select fixed
  {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      locale: "ko-KR",
      colorScheme: "dark",
    });
    await seedContext(ctx, { dark: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      document.documentElement.classList.add("dark");
    });
    await openImport(page);
    // Force dark on html if theme provider uses class
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      localStorage.setItem("ilbiseo-theme", "dark");
    });
    await pickFile(page, fixture);
    await page.waitForSelector("[data-excel-import-sheet-select]");
    await page
      .locator('[role="dialog"]')
      .screenshot({
        path: path.join(OUT, "ilbiseo-excel-import-dark-fixed.png"),
      });
    await ctx.close();
  }

  // 3) 지침 import preview
  {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      locale: "ko-KR",
    });
    await seedContext(ctx);
    const page = await ctx.newPage();
    await openImport(page);
    await pickFile(page, fixture);
    await page.waitForSelector("[data-excel-import-sheet-select]");
    const guideIdx = await page
      .locator("[data-excel-import-sheet-select] option")
      .evaluateAll((opts) =>
        Math.max(
          0,
          opts.findIndex((o) => (o.textContent || "").includes("지침")),
        ),
      );
    await page
      .locator("[data-excel-import-sheet-select]")
      .selectOption({ index: guideIdx });
    await page.locator('button:has-text("다음")').click();
    await page.waitForSelector("[data-excel-import-preview]");
    await page
      .locator('[role="dialog"]')
      .screenshot({
        path: path.join(OUT, "ilbiseo-excel-import-guide-habit.png"),
      });
    await ctx.close();
  }

  // 4) Similarity strict (할 일 preview)
  {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      locale: "ko-KR",
    });
    await seedContext(ctx);
    const page = await ctx.newPage();
    await openImport(page);
    await pickFile(page, fixture);
    await page.waitForSelector("[data-excel-import-sheet-select]");
    const todoIdx = await page
      .locator("[data-excel-import-sheet-select] option")
      .evaluateAll((opts) =>
        Math.max(
          0,
          opts.findIndex((o) => (o.textContent || "").includes("할 일")),
        ),
      );
    await page
      .locator("[data-excel-import-sheet-select]")
      .selectOption({ index: todoIdx });
    await page.locator('button:has-text("다음")').click();
    await page.waitForSelector("[data-excel-import-preview]");
    await page.waitForSelector("[data-excel-import-similar], [data-excel-import-exact]");
    await page
      .locator('[role="dialog"]')
      .screenshot({
        path: path.join(OUT, "ilbiseo-excel-import-similarity-strict.png"),
      });
    await ctx.close();
  }

  // 5) Deadline KST (same preview — deadline column)
  {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      locale: "ko-KR",
    });
    await seedContext(ctx);
    const page = await ctx.newPage();
    await openImport(page);
    await pickFile(page, fixture);
    await page.locator("[data-excel-import-sheet-select]").waitFor();
    const todoIdx2 = await page
      .locator("[data-excel-import-sheet-select] option")
      .evaluateAll((opts) =>
        Math.max(
          0,
          opts.findIndex((o) => (o.textContent || "").includes("할 일")),
        ),
      );
    await page
      .locator("[data-excel-import-sheet-select]")
      .selectOption({ index: todoIdx2 });
    await page.locator('button:has-text("다음")').click();
    await page.waitForSelector("[data-excel-import-deadline]");
    await page
      .locator('[role="dialog"]')
      .screenshot({
        path: path.join(OUT, "ilbiseo-excel-import-deadline-kst.png"),
      });
    await ctx.close();
  }

  await browser.close();
  const files = [
    "ilbiseo-excel-import-sheets-allowlist.png",
    "ilbiseo-excel-import-dark-fixed.png",
    "ilbiseo-excel-import-guide-habit.png",
    "ilbiseo-excel-import-similarity-strict.png",
    "ilbiseo-excel-import-deadline-kst.png",
  ];
  for (const f of files) {
    const p = path.join(OUT, f);
    console.log("ok", f, fs.statSync(p).size);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
