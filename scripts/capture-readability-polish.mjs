/**
 * Capture PC / mobile / dark / settings polish screenshots.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4351";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

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
  const y = Number(pick("year"));
  const m = Number(pick("month"));
  const d = Number(pick("day"));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(hour) || hour < 7) dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

const todayKst = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const seed = {
  version: 3,
  tasks: [
    {
      id: "t1",
      title: "팀 주간 회의",
      category: "work",
      kind: "spot",
      startDate: todayKst,
      targetDate: todayKst,
      urgency: 2,
      importance: 2,
      groupKey: "팀",
      memo: "안건 정리",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t2",
      title: "세금 서류",
      category: "personal",
      kind: "ongoing",
      startDate: todayKst,
      targetDate: todayKst,
      urgency: 1,
      importance: 3,
      groupKey: "세금",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-02T00:00:00.000Z",
      completedAt: null,
    },
  ],
  checklists: [],
  calendarEvents: [],
  guidelines: [{ id: "g1", title: "천천히 정확히", memo: "", done: false, createdAt: "2026-10-01T00:00:00.000Z", completedAt: null }],
  habits: [{ id: "h1", title: "아침 산책", memo: "", done: false, createdAt: "2026-10-01T00:00:00.000Z", completedAt: null }],
};

async function seedPage(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ s, dayKey }) => {
      localStorage.clear();
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      localStorage.setItem("ilbiseo-daily-cheer-kst", dayKey);
      localStorage.setItem("ilbiseo-state-v2", JSON.stringify(s));
    },
    { s: seed, dayKey: cheerDayKey() },
  );
  await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const cheer = page.locator("[data-daily-cheer]");
  if ((await cheer.count()) > 0) {
    await page.locator("[data-daily-cheer-confirm]").click({ force: true });
    await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  }
}

const browser = await chromium.launch();

// PC
{
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await seedPage(page);
  await page.waitForTimeout(300);
  // Assert new header label exists
  const hasListUpOld = await page.getByText("할일 LIST UP").count();
  const hasHalil = await page.getByRole("columnheader", { name: /할 일/ }).count();
  await page.screenshot({ path: `${OUT}/ilbiseo-polish-pc.png`, fullPage: false });
  console.log(JSON.stringify({ pc: true, hasListUpOld, hasHalil }));
  await page.close();
}

// Mobile
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await seedPage(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/ilbiseo-polish-mobile.png`, fullPage: false });
  await page.close();
}

// Dark
{
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await seedPage(page);
  await page.evaluate(() => {
    localStorage.setItem("ilbiseo-theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const cheer = page.locator("[data-daily-cheer]");
  if ((await cheer.count()) > 0) {
    await page.locator("[data-daily-cheer-confirm]").click({ force: true });
    await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  }
  await page.screenshot({ path: `${OUT}/ilbiseo-polish-dark.png`, fullPage: false });
  await page.close();
}

// Settings
{
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await seedPage(page);
  await page.getByRole("button", { name: /설정/ }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/ilbiseo-polish-settings.png`, fullPage: false });
  const syncHelp = await page.getByText("같은 코드로 PC와 폰").count();
  const noFleetBlurb = await page.getByText("폰 사용 안내").count();
  console.log(JSON.stringify({ settings: true, syncHelp, noFleetBlurb }));
  await page.close();
}

await browser.close();
console.log(JSON.stringify({ ok: true, out: OUT }));
