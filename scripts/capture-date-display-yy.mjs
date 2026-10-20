/**
 * Screenshots: father-facing YY-MM-DD dates on 할 일 + 오늘 브리핑.
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, "0");
const d = String(today.getDate()).padStart(2, "0");
const todayIso = `${y}-${m}-${d}`;

function addDays(iso, n) {
  const [yy, mm, dd] = iso.split("-").map(Number);
  const dt = new Date(yy, mm - 1, dd);
  dt.setDate(dt.getDate() + n);
  const Y = dt.getFullYear();
  const M = String(dt.getMonth() + 1).padStart(2, "0");
  const D = String(dt.getDate()).padStart(2, "0");
  return `${Y}-${M}-${D}`;
}

const pastStart = addDays(todayIso, -5);
const pastEnd = addDays(todayIso, -2);
const rangeEnd = addDays(todayIso, 3);

const state = {
  version: 3,
  tasks: [
    {
      id: "t1",
      title: "서류 제출",
      memo: "",
      category: "work",
      kind: "spot",
      startDate: todayIso,
      targetDate: todayIso,
      urgency: 2,
      importance: 3,
      groupKey: "서류",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t2",
      title: "병원 예약 기간",
      memo: "",
      category: "work",
      kind: "ongoing",
      startDate: "2026-10-10",
      targetDate: "2026-10-11",
      urgency: 2,
      importance: 2,
      groupKey: "병원",
      source: "manual",
      status: "active",
      createdAt: "2026-10-02T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t3",
      title: "책 읽기",
      memo: "",
      category: "work",
      kind: "someday",
      startDate: null,
      targetDate: null,
      urgency: 1,
      importance: 1,
      groupKey: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-03T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t4",
      title: "지난 일정 샘플",
      memo: "",
      category: "work",
      kind: "ongoing",
      startDate: pastStart,
      targetDate: pastEnd,
      urgency: 2,
      importance: 2,
      groupKey: "",
      source: "manual",
      status: "active",
      createdAt: "2026-09-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t5",
      title: "오늘 겹침 기간",
      memo: "",
      category: "work",
      kind: "ongoing",
      startDate: todayIso,
      targetDate: rangeEnd,
      urgency: 2,
      importance: 2,
      groupKey: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-04T00:00:00.000Z",
      completedAt: null,
    },
  ],
  checklists: [],
  calendarEvents: [
    {
      id: "c1",
      title: "출장",
      start: "2026-10-14",
      end: "2026-10-22",
      allDay: true,
      notes: "",
      source: "mock",
      calendarName: "mock",
    },
  ],
  guidelines: [],
  habits: [],
  excelLink: null,
  emailBriefing: null,
  updatedAt: new Date().toISOString(),
};

function cheerDayKey() {
  // Same boundary as cheerDayIsoKst (07:00 Asia/Seoul)
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
  let hour = Number.parseInt(parts.hour ?? "0", 10);
  if (hour === 24) hour = 0;
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (hour < 7) {
    const [Y, M, D] = day.split("-").map(Number);
    const utc = Date.UTC(Y, M - 1, D) - 24 * 60 * 60 * 1000;
    const y = new Date(utc).getUTCFullYear();
    const m = String(new Date(utc).getUTCMonth() + 1).padStart(2, "0");
    const d = String(new Date(utc).getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return day;
}

const cheerDay = cheerDayKey();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1360, height: 900 },
  locale: "ko-KR",
});
await context.addInitScript(
  ({ s, day }) => {
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
    localStorage.setItem("ilbiseo-daily-cheer-kst", day);
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(s));
  },
  { s: state, day: cheerDay },
);
const page = await context.newPage();
await page.addStyleTag({
  content:
    "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-overlay]{display:none!important}",
});
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

async function dismissCheer() {
  const cheer = page.locator("[data-daily-cheer]");
  if (!(await cheer.count())) return;
  if (!(await cheer.isVisible().catch(() => false))) return;
  const btn = page.locator("[data-daily-cheer-confirm]");
  if (await btn.count()) {
    await btn.click({ force: true });
  } else {
    await cheer.click({ force: true });
  }
  await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}
await dismissCheer();

const frameSelect = page.locator('select[aria-label="틀"]');
if (await frameSelect.count()) {
  await frameSelect.selectOption("work");
  await page.waitForTimeout(400);
}

// Desktop-only span (sm:inline) — avoid concatenating mobile+desktop clones
const desktopDeadlines = await page
  .locator("[data-excel-deadline-display] span.hidden.sm\\:inline")
  .allTextContents();
const normalized = desktopDeadlines.map((t) => t.trim()).filter(Boolean);
const yyHits = normalized.filter((t) =>
  /^(언젠가|\d{2}-\d{2}-\d{2}( ~ \d{2}-\d{2}-\d{2})?)$/.test(t),
);
const yyyyHits = normalized.filter((t) => /\d{4}-\d{2}-\d{2}/.test(t));

const table = page.locator("table").first();
await table.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(200);
// Crop around the sheet table so 마감목표 YY dates are readable
const tableBox = await table.boundingBox();
if (tableBox) {
  await page.screenshot({
    path: `${OUT}/ilbiseo-date-yy-todo.png`,
    clip: {
      x: Math.max(0, tableBox.x - 8),
      y: Math.max(0, tableBox.y - 48),
      width: Math.min(tableBox.width + 16, 1340),
      height: Math.min(tableBox.height + 56, 720),
    },
  });
} else {
  await page.screenshot({
    path: `${OUT}/ilbiseo-date-yy-todo.png`,
    fullPage: false,
  });
}

// Briefing preview
await dismissCheer();
await page.getByRole("button", { name: /오늘 브리핑/ }).first().click();
await page.waitForTimeout(500);
const gen = page.getByRole("button", { name: /지금 생성|미리보기/ });
if (await gen.count()) {
  await gen.first().click();
  await page.waitForTimeout(800);
}

const preview = page.locator('[data-briefing-preview="shown"]');
await preview.waitFor({ timeout: 10000 }).catch(() => null);
const briefingText = (await preview.count())
  ? await preview.innerText()
  : await page.locator("body").innerText();
const briefingHasYy = /기한\s+\d{2}-\d{2}-\d{2}/.test(briefingText);
const briefingHasYyyy = /기한\s+\d{4}-\d{2}-\d{2}/.test(briefingText);

if (await preview.count()) {
  await preview.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await preview.boundingBox();
  if (box) {
    await page.screenshot({
      path: `${OUT}/ilbiseo-date-yy-briefing.png`,
      clip: {
        x: Math.max(0, box.x - 8),
        y: Math.max(0, box.y - 8),
        width: Math.min(box.width + 16, 1340),
        height: Math.min(box.height + 16, 800),
      },
    });
  } else {
    await page.screenshot({
      path: `${OUT}/ilbiseo-date-yy-briefing.png`,
      fullPage: false,
    });
  }
} else {
  await page.screenshot({
    path: `${OUT}/ilbiseo-date-yy-briefing.png`,
    fullPage: false,
  });
}

console.log(
  JSON.stringify(
    {
      desktopDeadlines: normalized,
      yyHits: yyHits.length,
      yyyyHits: yyyyHits.length,
      briefingHasYy,
      briefingHasYyyy,
      briefingSnippet: briefingText.slice(0, 400),
      out: [
        `${OUT}/ilbiseo-date-yy-todo.png`,
        `${OUT}/ilbiseo-date-yy-briefing.png`,
      ],
    },
    null,
    2,
  ),
);

await browser.close();
if (yyyyHits.length > 0 || briefingHasYyyy) {
  console.error("FAIL: still showing YYYY-MM-DD in father UI");
  process.exit(1);
}
if (yyHits.length === 0) {
  console.error("FAIL: no YY-MM-DD deadline cells found");
  process.exit(1);
}
if (!briefingHasYy) {
  console.error("FAIL: briefing preview missing YY deadline labels");
  process.exit(1);
}
