/**
 * Screenshots for briefing preview toggle + past-by-end-date rule.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4347";
const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

function todayIsoKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
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
    const x = new Date(`${day}T12:00:00+09:00`);
    x.setDate(x.getDate() - 1);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(x);
  }
  return day;
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
  const today = todayIsoKst();
  const yday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const now = new Date().toISOString();

  const tasks = [
    {
      id: "t-active-range",
      title: "개인용 / 써칭 메트릭스 툴 만들기 (진행 중 구간)",
      category: "personal",
      kind: "ongoing",
      startDate: yday,
      targetDate: tomorrow,
      urgency: 2,
      importance: 1,
      groupKey: "",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "t-active-range2",
      title: "개인용 / 회의록 정리 해서 공유 할 것",
      category: "personal",
      kind: "ongoing",
      startDate: yday,
      targetDate: tomorrow,
      urgency: 2,
      importance: 1,
      groupKey: "",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "t-active-long",
      title: "개인용 / 팀원목표 재정리 (10/30까지)",
      category: "personal",
      kind: "ongoing",
      startDate: yday,
      targetDate: addDays(today, 10),
      urgency: 2,
      importance: 1,
      groupKey: "",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "t-today",
      title: "오늘 하루 할 일",
      category: "work",
      kind: "spot",
      startDate: today,
      targetDate: today,
      urgency: 2,
      importance: 2,
      groupKey: "",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "t-past-day",
      title: "어제 하루 (완전 지남)",
      category: "work",
      kind: "spot",
      startDate: yday,
      targetDate: yday,
      urgency: 2,
      importance: 2,
      groupKey: "",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "t-past-range",
      title: "9월 구간 (완전 지남)",
      category: "work",
      kind: "ongoing",
      startDate: "2026-09-01",
      targetDate: "2026-09-30",
      urgency: 2,
      importance: 3,
      groupKey: "",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  await context.addInitScript(
    ({ dayKey, state }) => {
      localStorage.setItem("ilbiseo-daily-cheer-kst", dayKey);
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      localStorage.setItem("ilbiseo-state-v2", JSON.stringify(state));
    },
    {
      dayKey: cheerDayKey(),
      state: {
        version: 3,
        tasks,
        checklists: [],
        calendarEvents: [],
        guidelines: [
          {
            id: "g1",
            title: "바닥치고 있는 중 이제 일어나자",
            memo: "",
            done: false,
            createdAt: now,
            completedAt: null,
          },
        ],
        habits: [
          {
            id: "h1",
            title: "아침 산책",
            memo: "",
            done: false,
            createdAt: now,
            completedAt: null,
          },
        ],
      },
    },
  );

  const page = await context.newPage();

  // ——— Briefing: hidden by default ———
  await page.goto(`${BASE}?view=briefing`, { waitUntil: "domcontentloaded" });
  await dismissCheerIfAny(page);
  await page.getByRole("heading", { name: "오늘 브리핑" }).waitFor({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "미리보기" }).waitFor();

  const syncBtn = page.getByRole("button", { name: "지금 맞춰 두기" });
  if ((await syncBtn.count()) > 0) {
    throw new Error("「지금 맞춰 두기」 should be removed");
  }
  if ((await page.locator('[data-briefing-preview="shown"]').count()) > 0) {
    throw new Error("Briefing body should be hidden by default");
  }

  const hiddenPath = path.join(OUT, "ilbiseo-briefing-preview-hidden.png");
  await page.screenshot({ path: hiddenPath, fullPage: false });

  // Show preview — local toggle only (no API / SMTP toast)
  await page.getByRole("button", { name: "미리보기" }).click();
  await page
    .locator('[data-briefing-preview="shown"]')
    .waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  const bodyText = await page.locator("body").innerText();
  if (
    bodyText.includes("미리보기만 했습니다") ||
    bodyText.includes("네이버 SMTP") ||
    bodyText.includes("미리보기 ·")
  ) {
    throw new Error(`Preview must not show SMTP/test-mail toast: ${bodyText.slice(0, 400)}`);
  }
  // Test-mail button stays available independently (not gated by preview)
  const testMail = page.getByRole("button", { name: "테스트 메일 보내기" });
  if (!(await testMail.isEnabled())) {
    throw new Error("테스트 메일 보내기 should stay enabled after preview");
  }
  const shownPath = path.join(OUT, "ilbiseo-briefing-preview-shown.png");
  await page.screenshot({ path: shownPath, fullPage: true });
  const toggleOnlyPath = path.join(
    OUT,
    "ilbiseo-briefing-preview-toggle-only.png",
  );
  await page.screenshot({ path: toggleOnlyPath, fullPage: false });
  // Optional: show settings + preview with test-mail still independent
  const independentPath = path.join(
    OUT,
    "ilbiseo-briefing-test-mail-independent.png",
  );
  await page.getByRole("button", { name: "테스트 메일 보내기" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: independentPath, fullPage: false });

  // ——— Past by end date ———
  await page.goto(`${BASE}?view=todo`, { waitUntil: "domcontentloaded" });
  await dismissCheerIfAny(page);
  await page.waitForTimeout(500);

  const frameSelect = page.locator('select[aria-label="틀"]');
  if (await frameSelect.count()) {
    await frameSelect.selectOption("all");
  }
  await page.waitForTimeout(400);

  await page.locator("[data-excel-past-separator]").first().waitFor({
    timeout: 10000,
  });

  const overdueTitles = await page
    .locator('[data-excel-overdue="1"] textarea[aria-label="할 일"]')
    .evaluateAll((els) => els.map((e) => e.value));
  const activeTitles = await page
    .locator(
      'tr:not([data-excel-overdue="1"]) textarea[aria-label="할 일"]',
    )
    .evaluateAll((els) => els.map((e) => e.value));

  const mustActive = [
    "개인용 / 써칭 메트릭스 툴 만들기 (진행 중 구간)",
    "개인용 / 회의록 정리 해서 공유 할 것",
    "개인용 / 팀원목표 재정리 (10/30까지)",
    "오늘 하루 할 일",
  ];
  for (const t of mustActive) {
    if (!activeTitles.includes(t)) {
      throw new Error(`Expected active (not past): ${t} · ${JSON.stringify({ activeTitles, overdueTitles })}`);
    }
    if (overdueTitles.includes(t)) {
      throw new Error(`Ongoing wrongly past: ${t}`);
    }
  }
  for (const t of ["어제 하루 (완전 지남)", "9월 구간 (완전 지남)"]) {
    if (!overdueTitles.includes(t)) {
      throw new Error(`Expected past: ${t} · ${JSON.stringify(overdueTitles)}`);
    }
  }

  await page.locator("[data-excel-past-separator]").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const pastPath = path.join(OUT, "ilbiseo-past-by-end-date.png");
  const table = page.locator("table").first();
  if (await table.count()) {
    await table.screenshot({ path: pastPath });
  } else {
    await page.screenshot({ path: pastPath, fullPage: false });
  }

  const summary = {
    today,
    hiddenPath,
    shownPath,
    toggleOnlyPath: path.join(OUT, "ilbiseo-briefing-preview-toggle-only.png"),
    independentPath: path.join(
      OUT,
      "ilbiseo-briefing-test-mail-independent.png",
    ),
    pastPath,
    overdueTitles,
    activeTitles,
  };
  fs.writeFileSync(
    path.join(OUT, "capture-briefing-preview-past-end.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
