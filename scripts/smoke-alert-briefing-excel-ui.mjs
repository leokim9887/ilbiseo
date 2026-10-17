/**
 * UI smoke: 추가 기능 메뉴에 엑셀 상단 · standalone 제거 · similarity UX
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

function cheerDayIsoKst(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? "0";
  let hour = Number.parseInt(pick("hour"), 10);
  if (hour === 24) hour = 0;
  const calendarDay = `${pick("year")}-${pick("month")}-${pick("day")}`;
  if (!Number.isFinite(hour) || hour < 7) {
    const [y, m, day] = calendarDay.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    dt.setDate(dt.getDate() - 1);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }
  return calendarDay;
}

const todayKst = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const cheerDay = cheerDayIsoKst();

await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.evaluate((day) => {
  localStorage.clear();
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
  localStorage.setItem("ilbiseo-install-dismissed-v1", "1");
  localStorage.setItem("ilbiseo-daily-cheer-kst", day);
}, cheerDay);
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
// Dismiss cheer if it still appears
const cheer = page.locator("[data-daily-cheer-confirm]");
if (await cheer.isVisible().catch(() => false)) {
  await cheer.click();
  await page.waitForTimeout(200);
}
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);

const standalone = await page.locator("[data-excel-import]").count();
if (standalone !== 0) {
  throw new Error("standalone 엑셀 불러오기 button should be gone");
}
const extras = page.locator("[data-toolbar-extras]");
if ((await extras.count()) !== 1) {
  throw new Error("추가 기능 trigger missing");
}
await extras.click();
await page.waitForTimeout(250);
const excelItem = page.locator("[data-toolbar-extras-excel]");
await excelItem.waitFor({ state: "visible", timeout: 3000 });
const memoItem = page.locator("[data-toolbar-extras-memo]");
const ocrItem = page.locator("[data-toolbar-extras-ocr]");
const excelBox = await excelItem.boundingBox();
const memoBox = await memoItem.boundingBox();
const ocrBox = await ocrItem.boundingBox();
if (!excelBox || !memoBox || !ocrBox) throw new Error("menu items missing boxes");
if (!(excelBox.y < memoBox.y && memoBox.y < ocrBox.y)) {
  throw new Error(
    `excel must be top of extras menu: excel=${excelBox.y} memo=${memoBox.y} ocr=${ocrBox.y}`,
  );
}

await page.screenshot({
  path: path.join(OUT, "ilbiseo-extras-menu-excel-top.png"),
});

// Close menu by clicking elsewhere
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.screenshot({
  path: path.join(OUT, "ilbiseo-extras-toolbar-no-standalone-excel.png"),
});

await page.evaluate(
  ({ todayIso, cheerDayKey }) => {
  localStorage.setItem("ilbiseo-daily-cheer-kst", cheerDayKey);
  const now = new Date().toISOString();
  localStorage.setItem(
    "ilbiseo-state-v2",
    JSON.stringify({
      version: 3,
      tasks: [
        {
          id: "t-peer",
          title: "병원 진료 예약 확인",
          category: "work",
          kind: "ongoing",
          startDate: todayIso,
          targetDate: todayIso,
          urgency: 2,
          importance: 2,
          groupKey: "병원",
          memo: "서류",
          source: "manual",
          status: "active",
          createdAt: now,
          completedAt: null,
        },
        {
          id: "t-edit",
          title: "새 할일",
          category: "work",
          kind: "spot",
          startDate: todayIso,
          targetDate: todayIso,
          urgency: 2,
          importance: 2,
          groupKey: "새",
          memo: "",
          source: "manual",
          status: "active",
          createdAt: now,
          completedAt: null,
        },
        {
          id: "t-range",
          title: "가족 여행 준비",
          category: "personal",
          kind: "ongoing",
          startDate: "2026-10-14",
          targetDate: "2026-10-21",
          urgency: 2,
          importance: 2,
          groupKey: "여행",
          memo: "항공권",
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
    }),
  );
},
  { todayIso: todayKst, cheerDayKey: cheerDay },
);

await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
if (await page.locator("[data-daily-cheer-confirm]").isVisible().catch(() => false)) {
  await page.locator("[data-daily-cheer-confirm]").click();
  await page.waitForTimeout(200);
}
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);

const row = page.locator('tr[data-excel-row="t-edit"]');
const title = row.locator('textarea[aria-label="할 일"]');
const memo = row.locator('textarea[aria-label="메모"]');

await title.fill("출장 준비 체크리스트");
await memo.fill("출장 준비 체크리스트");
await memo.blur();
await page.waitForTimeout(600);
if (await page.locator("[data-similarity-alert]").isVisible().catch(() => false)) {
  throw new Error("self title∩memo must not alert");
}

await title.fill("팀 주간 싱크");
await memo.fill("안건");
await title.blur();
await page.waitForTimeout(600);
if (await page.locator("[data-similarity-alert]").isVisible().catch(() => false)) {
  throw new Error("unrelated wording must not alert");
}

await title.fill("병원 진료 예약 점검");
await title.blur();
await page.waitForTimeout(700);
const alert = page.locator("[data-similarity-alert]");
await alert.waitFor({ state: "visible", timeout: 4000 });
await page.screenshot({
  path: path.join(OUT, "ilbiseo-similarity-real-dupe-only.png"),
  fullPage: true,
});
await page.locator("[data-similarity-alert-ok]").click();

const briefingHtml = await page.evaluate(async () => {
  const state = JSON.parse(localStorage.getItem("ilbiseo-state-v2") || "{}");
  const res = await fetch("/api/daily-briefing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      send: false,
      tasks: state.tasks || [],
      calendarEvents: state.calendarEvents || [],
      guidelines: [],
      habits: [],
    }),
  });
  return res.json();
});

if (!briefingHtml?.briefing?.html?.includes("【할 일】")) {
  throw new Error("briefing html missing");
}
fs.writeFileSync(
  path.join(OUT, "ilbiseo-briefing-email-sample.html"),
  `<!doctype html><meta charset="utf-8"><title>브리핑 샘플</title>${briefingHtml.briefing.html}`,
);
fs.writeFileSync(
  path.join(OUT, "ilbiseo-briefing-email-sample.txt"),
  briefingHtml.briefing.plaintext || "",
);

// Capture rendered HTML in browser for screenshot
await page.setContent(
  `<!doctype html><meta charset="utf-8"><body style="margin:24px;background:#f4f6f5">${briefingHtml.briefing.html}</body>`,
  { waitUntil: "domcontentloaded" },
);
await page.screenshot({
  path: path.join(OUT, "ilbiseo-briefing-email-sample.png"),
  fullPage: true,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      standaloneExcelButtons: standalone,
      excelMenuTop: true,
      briefingDate: briefingHtml.briefing.date,
      rangeInBriefing: String(briefingHtml.briefing.plaintext || "").includes(
        "가족 여행 준비",
      ),
      media: [
        "ilbiseo-extras-menu-excel-top.png",
        "ilbiseo-extras-toolbar-no-standalone-excel.png",
        "ilbiseo-similarity-real-dupe-only.png",
        "ilbiseo-briefing-email-sample.html",
        "ilbiseo-briefing-email-sample.txt",
        "ilbiseo-briefing-email-sample.png",
      ],
    },
    null,
    2,
  ),
);

await browser.close();
