/**
 * Screenshot: 할 일 → 구글 캘린더 틀 rows without account email.
 */
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4347";
const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

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

function todayIsoKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

async function main() {
  const today = todayIsoKst();
  const events = [
    {
      id: "e1",
      title: "승식통화10/20~29사이 약속 잡기",
      start: today,
      end: addDays(today, 2),
      allDay: true,
      notes: "",
      source: "google",
      calendarName: "goldage64@gmail.com",
    },
    {
      id: "e2",
      title: "나 법인 건강보험자격 취득 신고할 것",
      start: today,
      end: addDays(today, 5),
      allDay: true,
      notes: "",
      source: "google",
      calendarName: "goldage64@gmail.com",
    },
    {
      id: "e3",
      title: "89동기 모임 장 소 확인 및 예약 확인 재 공지 할 것",
      start: today,
      end: addDays(today, 1),
      allDay: true,
      notes: "",
      source: "google",
      calendarName: "goldage64@gmail.com",
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
        tasks: [],
        checklists: [],
        calendarEvents: events,
        guidelines: [],
        habits: [],
      },
    },
  );

  const page = await context.newPage();
  await page.goto(`${BASE}?view=todo`, { waitUntil: "domcontentloaded" });
  const cheer = page.locator("[data-daily-cheer-confirm]");
  if (await cheer.count()) await cheer.click({ force: true }).catch(() => {});

  const frameSelect = page.locator('select[aria-label="틀"]');
  await frameSelect.waitFor({ timeout: 15000 });
  await frameSelect.selectOption("gcal");
  await page.waitForTimeout(500);

  // Prefer "오늘" chip so seeded today events show
  const todayChip = page.getByRole("button", { name: "오늘" });
  if (await todayChip.count()) await todayChip.click().catch(() => {});
  await page.waitForTimeout(400);

  const calRows = page.locator('tr[aria-label="캘린더 일정 행"]');
  await calRows.first().waitFor({ timeout: 10000 });
  const texts = await calRows.allTextContents();
  console.log({ texts });
  for (const t of texts) {
    if (t.includes("@") || t.includes("goldage64")) {
      throw new Error(`GCal row still shows account email: ${t}`);
    }
  }
  if (texts.length < 1) throw new Error("Expected gcal rows");

  const out = path.join(OUT, "ilbiseo-todo-gcal-no-email.png");
  const table = page.locator("table").first();
  if (await table.count()) {
    await table.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage: false });
  }
  fs.writeFileSync(
    path.join(OUT, "capture-todo-gcal-no-email.json"),
    JSON.stringify({ out, texts, today }, null, 2),
  );
  console.log("ok", out);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
