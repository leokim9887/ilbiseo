import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

const SEED = {
  version: 2,
  tasks: [],
  checklists: [],
  calendarEvents: [
    {
      id: "ev-today",
      title: "오늘 미팅",
      start: "2026-10-05T10:00:00",
      end: "2026-10-05T11:00:00",
      allDay: false,
      notes: "ICS import",
      source: "ics",
    },
    {
      id: "ev-past",
      title: "작년 일정",
      start: "2025-09-15T09:00:00",
      end: "2025-09-15T10:00:00",
      allDay: false,
      notes: "ICS import",
      source: "ics",
    },
  ],
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ state, welcomeKey, storageKey }) => {
      localStorage.clear();
      localStorage.setItem(welcomeKey, "1");
      localStorage.setItem(storageKey, JSON.stringify(state));
    },
    {
      state: SEED,
      welcomeKey: "ilbiseo-welcome-seen-v2",
      storageKey: "ilbiseo-state-v2",
    },
  );
  await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const wb = page.locator(".excel-wb");
  await wb.getByLabel("틀").selectOption("gcal");
  await page.waitForTimeout(400);

  for (const label of ["오늘부터", "이날만", "이날부터 앞으로"]) {
    const n = await wb.getByRole("button", { name: label, exact: true }).count();
    if (n > 0) throw new Error(`removed control still present: ${label}`);
  }
  if ((await wb.getByLabel("연도 선택").count()) > 0) {
    throw new Error("mini calendar year dropdown still present");
  }
  if ((await wb.getByText("선택한 날:").count()) > 0) {
    throw new Error("선택한 날 panel still present");
  }

  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-no-mini-cal-default.png`,
    fullPage: true,
  });
  await wb.screenshot({
    path: `${OUT}/ilbiseo-gcal-no-mini-cal-sheet.png`,
  });

  await wb.getByRole("button", { name: "오늘", exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-no-mini-cal-today.png`,
    fullPage: true,
  });

  await wb.getByLabel("캘린더 기간 시작일").fill("2025-09-01");
  await wb.getByLabel("캘린더 기간 종료일").fill("2025-09-30");
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `${OUT}/ilbiseo-gcal-no-mini-cal-range.png`,
    fullPage: true,
  });

  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
