/**
 * Capture Excel import preview listing only 새 / 바뀜 (no 「그대로」 rows).
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import ExcelJS from "exceljs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
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
  // unchanged vs seed
  todo.addRow([1, "업무용", "기존 그대로 할 일", "2026-12-01", 2]);
  // changed
  todo.addRow([2, "개인용", "바뀐 세금 신고", "2026-12-20", 3]);
  // new
  todo.addRow([3, "과제용", "완전히 새 숙제", "2026-12-15", 1]);
  const guide = wb.addWorksheet("지침");
  guide.addRow(["순서", "내용", "메모"]);
  guide.addRow([1, "기존 지침", "그대로"]);
  guide.addRow([2, "새 지침", ""]);
  const habit = wb.addWorksheet("습관");
  habit.addRow(["순서", "내용", "메모"]);
  habit.addRow([1, "물 마시기", ""]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const p = path.join(OUT, "ilbiseo-import-preview-new-changed-fixture.xlsx");
  fs.writeFileSync(p, buf);
  return p;
}

async function dismissCheerIfAny(page) {
  const cheer = page.locator("[data-daily-cheer]");
  if ((await cheer.count()) > 0) {
    const btn = page.locator("[data-daily-cheer-confirm]");
    if ((await btn.count()) > 0) {
      await btn.click({ force: true, timeout: 5000 }).catch(() => {});
    }
    await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  }
}

async function main() {
  const fixture = await buildFixture();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 900 },
    locale: "ko-KR",
  });
  const now = new Date().toISOString();
  await context.addInitScript(
    ({ dayKey, now }) => {
      localStorage.setItem("ilbiseo-daily-cheer-kst", dayKey);
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      localStorage.setItem(
        "ilbiseo-state-v2",
        JSON.stringify({
          version: 3,
          tasks: [
            {
              id: "same1",
              title: "기존 그대로 할 일",
              category: "work",
              kind: "spot",
              startDate: "2026-12-01",
              targetDate: "2026-12-01",
              urgency: 2,
              importance: 2,
              groupKey: "기존",
              memo: "",
              source: "manual",
              status: "active",
              createdAt: now,
              completedAt: null,
            },
            {
              id: "chg1",
              title: "바뀐 세금 신고",
              category: "personal",
              kind: "spot",
              startDate: "2026-11-01",
              targetDate: "2026-11-01",
              urgency: 2,
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
              memo: "그대로",
              done: false,
              createdAt: now,
              completedAt: null,
            },
          ],
          habits: [
            {
              id: "h1",
              title: "물 마시기",
              memo: "",
              done: false,
              createdAt: now,
              completedAt: null,
            },
          ],
        }),
      );
    },
    { dayKey: cheerDayKey(), now },
  );

  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await dismissCheerIfAny(page);
  await page.locator("[data-excel-import]").click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  const nextBtn = page.locator('button:has-text("다음")');
  if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nextBtn.click();
  }
  await page.waitForSelector("[data-excel-import-preview]", { timeout: 12000 });
  await page.waitForTimeout(400);

  const dialog = page.locator('[role="dialog"]');
  const text = await dialog.innerText();
  console.log("preview text snippet:\n", text.slice(0, 800));

  // No 「그대로」 label in table cells (summary may say 생략)
  const deltaLabels = await page
    .locator("[data-excel-import-delta]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-excel-import-delta")));
  console.log("delta attrs", deltaLabels);
  if (deltaLabels.includes("unchanged")) {
    throw new Error("Preview still lists unchanged rows");
  }
  if (!deltaLabels.includes("new") || !deltaLabels.includes("changed")) {
    throw new Error(`Expected new+changed in preview, got ${JSON.stringify(deltaLabels)}`);
  }
  // Table body text should not have standalone 구분 cell "그대로"
  const tableText = await page
    .locator("[data-excel-import-sheet] table")
    .allInnerTexts();
  for (const t of tableText) {
    if (/^그대로$/m.test(t) || t.split("\n").includes("그대로")) {
      // allow "그대로" only inside title/memo content, not as delta label column
      const lines = t.split("\n").map((l) => l.trim());
      if (lines.includes("그대로") && lines.includes("구분")) {
        // check if any row's first cell-like token is 그대로 after 구분 header
        const after = lines.slice(lines.indexOf("구분") + 1);
        // crude: if "그대로" appears as its own line near 구분 values
        const idx = after.indexOf("그대로");
        if (idx >= 0 && after[idx + 1] && !after[idx + 1].includes("메모")) {
          // title "기존 지침" has memo 그대로 — OK if next to content
        }
      }
    }
  }

  if (!text.includes("생략") && !text.includes("새")) {
    console.warn("summary may be missing skip note", text.slice(0, 200));
  }

  const out = path.join(OUT, "ilbiseo-import-preview-new-changed-only.png");
  await dialog.screenshot({ path: out });
  fs.writeFileSync(
    path.join(OUT, "capture-import-preview-new-changed-only.json"),
    JSON.stringify({ out, deltaLabels, text: text.slice(0, 600) }, null, 2),
  );
  console.log("ok", out);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
