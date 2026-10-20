/**
 * Screenshot: briefing 【구글 캘린더】 lines without trailing account email.
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
  const now = new Date().toISOString();
  const events = [
    {
      id: "e1",
      title: "승식통화10/20~29사이 약속 잡기",
      start: addDays(today, -3),
      end: addDays(today, -1),
      allDay: true,
      notes: "",
      source: "google",
      calendarName: "goldage64@gmail.com",
    },
    {
      id: "e2",
      title: "나 법인 건강보험자격 취득 신고할 것",
      start: addDays(today, -2),
      end: addDays(today, 5),
      allDay: true,
      notes: "",
      source: "google",
      calendarName: "goldage64@gmail.com",
    },
    {
      id: "e3",
      title: "89동기 모임 장 소 확인 및 예약 확인 재 공지 할 것",
      start: addDays(today, -1),
      end: today,
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
  await page.goto(`${BASE}?view=briefing`, { waitUntil: "domcontentloaded" });
  const cheer = page.locator("[data-daily-cheer-confirm]");
  if (await cheer.count()) await cheer.click({ force: true }).catch(() => {});

  await page.getByRole("button", { name: "미리보기" }).click();
  await page.locator('[data-briefing-preview="shown"]').waitFor();
  await page.getByText("【구글 캘린더】").waitFor({ timeout: 10000 });

  const section = page
    .locator('[data-briefing-preview="shown"] section')
    .filter({ hasText: "【구글 캘린더】" });
  const lines = await section.locator("li").allTextContents();
  console.log({ lines });
  for (const line of lines) {
    if (line.includes("@") || line.includes("goldage64")) {
      throw new Error(`Calendar line still has email: ${line}`);
    }
    if (line.includes(" · ")) {
      throw new Error(`Calendar line still has middle-dot suffix: ${line}`);
    }
  }
  if (lines.length < 1) throw new Error("Expected calendar lines");

  const out = path.join(OUT, "ilbiseo-briefing-gcal-no-email.png");
  await section.first().screenshot({ path: out });
  fs.writeFileSync(
    path.join(OUT, "capture-briefing-gcal-no-email.json"),
    JSON.stringify({ out, lines, today }, null, 2),
  );
  console.log("ok", out);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
