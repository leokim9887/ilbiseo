/**
 * Screenshots: deadline exact · delta-only preview · guides/habits unified · no done
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import ExcelJS from "exceljs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4339";
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

async function buildDeltaFixture() {
  const wb = new ExcelJS.Workbook();
  const todo = wb.addWorksheet("할 일");
  todo.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
  todo.addRow([1, "업무용", "병원 진료", "2026-12-01", 2]);
  const r2 = todo.addRow([
    2,
    "개인용",
    "세금 신고",
    new Date(Date.UTC(2026, 11, 20)),
    3,
  ]);
  r2.getCell(4).numFmt = "yyyy-mm-dd";
  todo.addRow([3, "과제용", "새 숙제 제출", "2026-12-01 ~ 2026-12-31", 1]);
  todo.addRow([4, "업무용", "언젠가 할 일", "언젠가", 1]);
  const guide = wb.addWorksheet("지침");
  guide.addRow(["순서", "내용", "메모"]);
  guide.addRow([1, "아침 스트레칭", "바뀐 메모"]);
  guide.addRow([2, "새 지침 항목", ""]);
  const habit = wb.addWorksheet("습관");
  habit.addRow(["순서", "내용", "메모"]);
  habit.addRow([1, "물 마시기", "하루 8잔"]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const p = path.join(OUT, "ilbiseo-excel-import-delta-fixture.xlsx");
  fs.writeFileSync(p, buf);
  return p;
}

async function seedContext(context) {
  const dayKey = cheerDayKey();
  await context.addInitScript(
    ({ dayKey: dk }) => {
      localStorage.setItem("ilbiseo-daily-cheer-kst", dk);
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
      localStorage.removeItem("ilbiseo-theme");
      const now = new Date().toISOString();
      localStorage.setItem(
        "ilbiseo-state-v2",
        JSON.stringify({
          version: 3,
          tasks: [
            {
              id: "seed-same",
              title: "병원 진료",
              category: "work",
              kind: "spot",
              startDate: "2026-12-01",
              targetDate: "2026-12-01",
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
              id: "seed-change",
              title: "세금 신고",
              category: "personal",
              kind: "spot",
              startDate: "2026-12-05",
              targetDate: "2026-12-05",
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
              title: "아침 스트레칭",
              memo: "옛 메모",
              done: false,
              createdAt: now,
              completedAt: null,
            },
            {
              id: "g2",
              title: "저녁 정리",
              memo: "",
              done: false,
              createdAt: now,
              completedAt: null,
            },
          ],
          habits: [
            {
              id: "h1",
              title: "물 마시기",
              memo: "하루 8잔",
              done: false,
              createdAt: now,
              completedAt: null,
            },
            {
              id: "h2",
              title: "산책하기",
              memo: "30분",
              done: false,
              createdAt: now,
              completedAt: null,
            },
          ],
        }),
      );
    },
    { dayKey },
  );
}

async function dismissOverlays(page) {
  for (const sel of [
    'button:has-text("시작하기")',
    "[data-daily-cheer-confirm]",
    "[data-install-dismiss]",
    'button:has-text("닫기")',
  ]) {
    const b = page.locator(sel);
    if ((await b.count()) > 0) {
      await b.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

async function main() {
  const fixture = await buildDeltaFixture();
  const browser = await chromium.launch({ headless: true });

  // 1) Delta + deadline preview
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await seedContext(context);
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await dismissOverlays(page);
    await page.locator("[data-toolbar-extras]").first().click();
    await page.locator("[data-toolbar-extras-excel]").click();
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await page.waitForTimeout(800);
    const sheetPick = page.locator("[data-excel-import-sheet-pick]");
    if ((await sheetPick.count()) > 0) {
      await sheetPick.locator('button:has-text("다음")').click();
    }
    await page.waitForSelector("[data-excel-import-preview]", {
      timeout: 12000,
    });
    await page.waitForSelector("[data-excel-import-delta-summary]");
    const text = await page.locator("[role=dialog]").innerText();
    if (!text.includes("그대로") || !text.includes("바뀜") || !text.includes("새")) {
      console.error("delta labels missing", text.slice(0, 400));
      process.exit(1);
    }
    if (!text.includes("2026-12-01") || !text.includes("언젠가")) {
      console.error("deadline labels missing", text.slice(0, 400));
      process.exit(1);
    }
    const dialog = page.locator("[role=dialog]");
    await dialog.screenshot({
      path: path.join(OUT, "ilbiseo-excel-import-delta-only.png"),
    });
    await dialog.screenshot({
      path: path.join(OUT, "ilbiseo-excel-deadline-exact.png"),
    });
    await context.close();
  }

  // 2) Unified guides/habits + no done
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await seedContext(context);
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await dismissOverlays(page);
    await page.waitForSelector("[data-side-lists-unified]", { timeout: 10000 });
    const pair = page.locator("[data-side-lists-pair]");
    await pair.scrollIntoViewIfNeeded();
    await pair.screenshot({
      path: path.join(OUT, "ilbiseo-guides-habits-unified-pc.png"),
    });

    const guide = page.locator('[data-side-list="guideline"]');
    const guideText = await guide.innerText();
    if (/완료\s*$/m.test(guideText) || guideText.includes("완료 처리")) {
      console.error("FAIL: 완료 UI in guideline", guideText.slice(0, 200));
      process.exit(1);
    }
    // selection checkboxes OK; no complete bulk button
    if ((await guide.locator("[data-side-bulk-complete]").count()) > 0) {
      console.error("FAIL: bulk complete still present");
      process.exit(1);
    }
    const unifiedAttr = await guide.getAttribute("data-side-list-unified");
    if (unifiedAttr !== "1") {
      console.error("FAIL: unified marker missing", unifiedAttr);
      process.exit(1);
    }
    await guide.screenshot({
      path: path.join(OUT, "ilbiseo-guides-habits-no-done.png"),
    });

    // 한 일 nav — same unified side lists (no mode split)
    await page
      .locator('nav[aria-label="주요 메뉴"]')
      .first()
      .locator("button", { hasText: "한 일" })
      .click();
    await page.waitForTimeout(600);
    await page.waitForSelector("[data-side-lists-unified]");
    const titles = await page
      .locator("[data-side-title]")
      .evaluateAll((els) => els.map((e) => e.value));
    for (const want of ["아침 스트레칭", "저녁 정리", "물 마시기", "산책하기"]) {
      if (!titles.includes(want)) {
        console.error("FAIL: missing on 한 일 tab", want, titles);
        process.exit(1);
      }
    }
    if ((await page.locator("[data-side-bulk-complete]").count()) > 0) {
      console.error("FAIL: 완료 appeared on 한 일 tab");
      process.exit(1);
    }
    await page.locator("[data-side-lists-pair]").screenshot({
      path: path.join(OUT, "ilbiseo-guides-habits-unified-done-tab.png"),
    });
    await context.close();
  }

  await browser.close();

  const needed = [
    "ilbiseo-excel-deadline-exact.png",
    "ilbiseo-excel-import-delta-only.png",
    "ilbiseo-guides-habits-unified-pc.png",
    "ilbiseo-guides-habits-no-done.png",
  ];
  for (const f of needed) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p) || fs.statSync(p).size < 1000) {
      console.error("MISSING/SMALL", p);
      process.exit(1);
    }
    console.log("ok", f, fs.statSync(p).size);
  }
  console.log("captures done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
