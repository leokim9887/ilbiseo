/**
 * Capture excel-import renewal UI: 틀 classification, similar notice, deadline.
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

async function buildFixture() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("할 일");
  ws.addRow([
    "순서",
    "틀",
    "할일 LIST UP",
    "마감목표",
    "중요도",
    "완료여부",
  ]);
  // Range as text (father-edited style)
  ws.addRow([
    1,
    "업무용",
    "병원 진료 예약 점검",
    "2026-10-17 ~ 2026-10-20",
    3,
    "",
  ]);
  const r2 = ws.addRow([
    2,
    "개인용",
    "세금 신고 준비",
    new Date(Date.UTC(2026, 10, 5)),
    2,
    "",
  ]);
  r2.getCell(4).numFmt = "m/d/yy";
  ws.addRow([3, "과제용", "언젠가 책 정리", "언젠가", 1, ""]);
  ws.addRow([4, "팀원용", "팀 주간 회의", "2026-10-22", 2, ""]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const p = path.join(OUT, "ilbiseo-excel-import-renewal-fixture.xlsx");
  fs.writeFileSync(p, buf);
  return p;
}

function cheerDayKey() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (hour < 7) {
    const d = new Date(`${day}T12:00:00+09:00`);
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
  return day;
}

async function dismissCheerIfAny(page) {
  const cheer = page.locator("[data-daily-cheer]");
  if ((await cheer.count()) > 0) {
    const btn = page.locator("[data-daily-cheer-confirm]");
    if ((await btn.count()) > 0) {
      await btn.click({ force: true, timeout: 5000 });
    }
    await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  }
}

async function seedContext(context) {
  const key = cheerDayKey();
  await context.addInitScript((dayKey) => {
    localStorage.setItem("ilbiseo-daily-cheer-kst", dayKey);
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    const now = new Date().toISOString();
    const state = {
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
          memo: "서류",
          source: "manual",
          status: "active",
          createdAt: now,
          completedAt: null,
        },
        {
          id: "seed-other",
          title: "기존 업무 메모",
          category: "work",
          kind: "ongoing",
          startDate: "2026-10-10",
          targetDate: "2026-10-30",
          urgency: 1,
          importance: 2,
          groupKey: "기존",
          memo: "",
          source: "manual",
          status: "active",
          createdAt: now,
          completedAt: null,
        },
      ],
      checklists: [],
      calendarEvents: [],
      guidelines: [],
      habits: [],
    };
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(state));
  }, key);
}

async function seedAndOpen(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await dismissCheerIfAny(page);
  // Ensure cheer key matches runtime (timezone quirks)
  await page.evaluate(() => {
    // Match app cheerDayIsoKst as closely as possible
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
      const yy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      day = `${yy}-${mm}-${dd}`;
    }
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissCheerIfAny(page);
}

async function openImportPreview(page, fixturePath) {
  // Prefer 「전체」 frame so 틀 import is obvious
  const frameSelect = page.locator('select[aria-label="틀"]');
  if (await frameSelect.count()) {
    await frameSelect.selectOption("all");
  }
  await page.locator("[data-excel-import]").click();
  await page.waitForSelector('[data-slot="dialog-content"], [role="dialog"]');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixturePath);
  // May need sheet step
  const nextBtn = page.locator('button:has-text("다음")');
  if (await nextBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    // pick 할 일 if needed
    await nextBtn.click();
  }
  await page.waitForSelector("text=건 · 기존 목록에 추가", {
    timeout: 8000,
  });
}

async function main() {
  const fixture = await buildFixture();
  const browser = await chromium.launch({ headless: true });

  // PC — 틀 classification + similar + deadline
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "ko-KR",
    });
    await seedContext(context);
    const page = await context.newPage();
    await seedAndOpen(page);
    await openImportPreview(page, fixture);

    await page
      .locator('[role="dialog"]')
      .screenshot({
        path: path.join(OUT, "ilbiseo-excel-import-틀분류-pc.png"),
      });

    // Similar banner should be visible — crop-ish full dialog again labeled
    await page
      .locator("[data-excel-import-similar]")
      .waitFor({ timeout: 3000 });
    await page
      .locator('[role="dialog"]')
      .screenshot({
        path: path.join(OUT, "ilbiseo-excel-import-유사알림-pc.png"),
      });

    // Deadline column visible in preview table
    await page
      .locator('[role="dialog"]')
      .screenshot({
        path: path.join(OUT, "ilbiseo-excel-import-마감목표-fix-pc.png"),
      });

    await context.close();
  }

  // Mobile
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: "ko-KR",
    });
    await seedContext(context);
    const page = await context.newPage();
    await seedAndOpen(page);
    await openImportPreview(page, fixture);
    await page
      .locator('[role="dialog"]')
      .screenshot({
        path: path.join(OUT, "ilbiseo-excel-import-mobile.png"),
      });
    await context.close();
  }

  await browser.close();

  const files = [
    "ilbiseo-excel-import-틀분류-pc.png",
    "ilbiseo-excel-import-유사알림-pc.png",
    "ilbiseo-excel-import-마감목표-fix-pc.png",
    "ilbiseo-excel-import-mobile.png",
  ];
  for (const f of files) {
    const p = path.join(OUT, f);
    const st = fs.statSync(p);
    console.log("ok", f, st.size);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
