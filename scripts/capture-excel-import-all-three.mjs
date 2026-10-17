/**
 * Screenshots: one-shot 3-sheet import · 한 일 without 완료여부
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

async function buildFixture() {
  const wb = new ExcelJS.Workbook();
  const todo = wb.addWorksheet("할 일");
  todo.addRow(["순서", "틀", "할일 LIST UP", "마감목표", "중요도"]);
  todo.addRow([1, "업무용", "병원 진료", "2026-12-01", 2]);
  todo.addRow([2, "개인용", "세금 신고", "2026-12-20", 3]);
  todo.addRow([3, "과제용", "새 숙제", "언젠가", 1]);
  const guide = wb.addWorksheet("지침");
  guide.addRow(["순서", "내용", "메모"]);
  guide.addRow([1, "아침 스트레칭", "바뀐 메모"]);
  guide.addRow([2, "새 지침", ""]);
  const habit = wb.addWorksheet("습관");
  habit.addRow(["순서", "내용", "메모"]);
  habit.addRow([1, "물 마시기", "하루 8잔"]);
  habit.addRow([2, "새 습관", ""]);
  // distractors — must not appear as picker (no picker at all)
  wb.addWorksheet("한 일").addRow(["x"]);
  wb.addWorksheet("구글캘린더").addRow(["x"]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const p = path.join(OUT, "ilbiseo-excel-import-all-three-fixture.xlsx");
  fs.writeFileSync(p, buf);
  return p;
}

async function seedContext(context) {
  const dayKey = cheerDayKey();
  await context.addInitScript(
    ({ dayKey: dk }) => {
      localStorage.setItem("ilbiseo-daily-cheer-kst", dk);
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
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
  const fixture = await buildFixture();
  const browser = await chromium.launch({ headless: true });

  // 1) One-shot import preview (all three, no sheet picker)
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
    await page.waitForSelector("[data-excel-import-preview]", {
      timeout: 12000,
    });
    // Must NOT show sheet picker
    if ((await page.locator("[data-excel-import-sheet-pick]").count()) > 0) {
      console.error("FAIL: sheet picker still shown");
      process.exit(1);
    }
    const text = await page.locator("[role=dialog]").innerText();
    if (!text.includes("할 일") || !text.includes("지침") || !text.includes("습관")) {
      console.error("FAIL: missing sheet sections", text.slice(0, 500));
      process.exit(1);
    }
    if ((await page.locator("[data-excel-import-sheet=todo]").count()) < 1) {
      console.error("FAIL: no todo block");
      process.exit(1);
    }
    if ((await page.locator("[data-excel-import-sheet=guideline]").count()) < 1) {
      console.error("FAIL: no guideline block");
      process.exit(1);
    }
    if ((await page.locator("[data-excel-import-sheet=habit]").count()) < 1) {
      console.error("FAIL: no habit block");
      process.exit(1);
    }
    await page.locator("[role=dialog]").screenshot({
      path: path.join(OUT, "ilbiseo-excel-import-all-three.png"),
    });
    await context.close();
  }

  // 2) 한 일 export headers — no 완료여부
  {
    const { execFileSync } = await import("child_process");
    const tmp = path.join(OUT, "_done-headers.json");
    execFileSync("npx", ["tsx", "scripts/dump-done-headers.ts", tmp], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    const headers = JSON.parse(fs.readFileSync(tmp, "utf8"));
    fs.unlinkSync(tmp);
    if (headers.includes("완료여부")) {
      console.error("FAIL: 완료여부 still on 한 일", headers);
      process.exit(1);
    }
    // Visual proof page
    const context = await browser.newContext({
      viewport: { width: 800, height: 360 },
    });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;font-family:system-ui;background:#f5f6f5">
      <div style="margin:24px;border:2px solid #217346;border-radius:8px;padding:24px;background:#fff">
        <h1 style="margin:0 0 8px;font-size:20px">「한 일」시트 — 완료여부 열 없음</h1>
        <p style="margin:0 0 16px;color:#555;font-size:14px">할 일과 동일 열 · 시트 자체가 「한 일」의미</p>
        <table style="border-collapse:collapse;width:100%;font-size:15px">
          <thead><tr style="background:#f3f3f3">
            ${headers.map((h) => `<th style="border:1px solid #9aa5ad;padding:8px">${h}</th>`).join("")}
          </tr></thead>
          <tbody><tr>
            <td style="border:1px solid #c5ccd2;padding:8px;text-align:center">1</td>
            <td style="border:1px solid #c5ccd2;padding:8px;text-align:center">업무용</td>
            <td style="border:1px solid #c5ccd2;padding:8px">끝난 작업</td>
            <td style="border:1px solid #c5ccd2;padding:8px;text-align:center">2026-11-01</td>
            <td style="border:1px solid #c5ccd2;padding:8px;text-align:center">2</td>
          </tr></tbody>
        </table>
        <p style="margin:16px 0 0;color:#217346;font-weight:600;font-size:14px">headers: ${headers.join(" · ")}</p>
      </div>
    </body></html>`);
    await page.screenshot({
      path: path.join(OUT, "ilbiseo-excel-done-no-완료여부.png"),
    });
    await context.close();
  }

  await browser.close();

  for (const f of [
    "ilbiseo-excel-import-all-three.png",
    "ilbiseo-excel-done-no-완료여부.png",
  ]) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p) || fs.statSync(p).size < 1000) {
      console.error("MISSING", p);
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
