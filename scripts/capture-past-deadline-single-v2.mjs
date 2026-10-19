/**
 * Prove: already-stored past~today ranges normalize on load to single past dates
 * (no re-import). Matches ui-refs/deadline-past-range-still-broken.png patterns.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
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

function yday(iso, n = 1) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
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
  const d1 = yday(today, 1);
  const d3 = yday(today, 3);
  const d4 = yday(today, 4);

  // Seed BAD stored shapes (as before v2 normalize) — past ~ today
  const now = new Date().toISOString();
  const badTasks = [
    {
      id: "cur1",
      title: "오늘 할 일",
      category: "personal",
      kind: "spot",
      startDate: today,
      targetDate: today,
      urgency: 2,
      importance: 2,
      groupKey: "오늘",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "bad30",
      title: "승식과 10/21 안양행 선물 준비",
      category: "personal",
      kind: "ongoing",
      startDate: d1,
      targetDate: today,
      urgency: 2,
      importance: 1,
      groupKey: "승식",
      memo: "",
      source: "import",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "bad31",
      title: "이력서 판정 체크 리스트",
      category: "personal",
      kind: "ongoing",
      startDate: d1,
      targetDate: today,
      urgency: 2,
      importance: 1,
      groupKey: "이력",
      memo: "",
      source: "import",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "ok32",
      title: "이미 단일인 과거",
      category: "personal",
      kind: "spot",
      startDate: d3,
      targetDate: d3,
      urgency: 2,
      importance: 3,
      groupKey: "단일",
      memo: "",
      source: "import",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "bad33",
      title: "과거~오늘 구간 33",
      category: "personal",
      kind: "ongoing",
      startDate: d3,
      targetDate: today,
      urgency: 2,
      importance: 1,
      groupKey: "b33",
      memo: "",
      source: "import",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
    {
      id: "bad35",
      title: "과거~오늘 구간 35",
      category: "personal",
      kind: "ongoing",
      startDate: d4,
      targetDate: today,
      urgency: 2,
      importance: 1,
      groupKey: "b35",
      memo: "",
      source: "import",
      status: "active",
      createdAt: now,
      completedAt: null,
    },
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    locale: "ko-KR",
  });
  await context.addInitScript(
    ({ dayKey, tasks }) => {
      localStorage.setItem("ilbiseo-daily-cheer-kst", dayKey);
      localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      // Intentionally store BAD past~today — app load must normalize
      localStorage.setItem(
        "ilbiseo-state-v2",
        JSON.stringify({
          version: 3,
          tasks,
          checklists: [],
          calendarEvents: [],
          guidelines: [],
          habits: [],
        }),
      );
    },
    { dayKey: cheerDayKey(), tasks: badTasks },
  );

  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await dismissCheerIfAny(page);
  await page.waitForTimeout(600);

  const frameSelect = page.locator('select[aria-label="틀"]');
  if (await frameSelect.count()) await frameSelect.selectOption("personal");
  await page.waitForTimeout(400);
  await page.locator("[data-excel-past-separator]").first().waitFor({
    timeout: 10000,
  });
  await page.evaluate(() => {
    document
      .querySelector("[data-excel-past-separator]")
      ?.scrollIntoView({ block: "center" });
    const overdue = document.querySelectorAll('[data-excel-overdue="1"]');
    overdue[overdue.length - 1]?.scrollIntoView({ block: "end" });
  });
  await page.waitForTimeout(300);

  const overdueDisplays = await page
    .locator('[data-excel-overdue="1"]')
    .evaluateAll((rows) =>
      rows.map((r) => {
        const title =
          r.querySelector('textarea[aria-label="할 일"]')?.value || "";
        const btn = r.querySelector("[data-excel-deadline-display]");
        const dl = (btn?.textContent || "").replace(/\s+/g, " ").trim();
        return { title, dl };
      }),
    );
  console.log("overdue displays", overdueDisplays);

  for (const row of overdueDisplays) {
    if (row.dl.includes("~") && row.dl.includes(today.slice(5))) {
      // compact form might be 26.10.18~26.10.19
      throw new Error(`Still showing range-with-today: ${JSON.stringify(row)}`);
    }
    if (row.dl.includes(`~ ${today}`) || row.dl.includes(`~${today}`)) {
      throw new Error(`Still showing ISO range-with-today: ${JSON.stringify(row)}`);
    }
    if (row.dl.includes("~")) {
      throw new Error(`Past row still has tilde range: ${JSON.stringify(row)}`);
    }
  }

  // Persisted state should also be collapsed
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem("ilbiseo-state-v2");
    return raw ? JSON.parse(raw) : null;
  });
  const badStored = (stored?.tasks || []).filter((t) =>
    ["bad30", "bad31", "bad33", "bad35"].includes(t.id),
  );
  for (const t of badStored) {
    if (t.startDate !== t.targetDate || t.targetDate === today) {
      throw new Error(`Storage not collapsed: ${JSON.stringify(t)}`);
    }
  }
  console.log(
    "stored collapsed",
    badStored.map((t) => ({
      id: t.id,
      start: t.startDate,
      end: t.targetDate,
      kind: t.kind,
    })),
  );

  const out = path.join(OUT, "ilbiseo-past-deadline-single-v2.png");
  await page.screenshot({ path: out, fullPage: true });
  fs.writeFileSync(
    path.join(OUT, "capture-past-deadline-single-v2.json"),
    JSON.stringify(
      { today, out, overdueDisplays, badStored },
      null,
      2,
    ),
  );
  console.log("ok", out);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
