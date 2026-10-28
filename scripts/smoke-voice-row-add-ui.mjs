/**
 * Smoke: 「음성으로 입력」 button + confirm dialog (mocked SpeechRecognition).
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

const todayKst = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

page.on("dialog", async (d) => d.accept());

await page.addInitScript(() => {
  class FakeRec {
    constructor() {
      this.lang = "ko-KR";
      this.continuous = false;
      this.interimResults = true;
      this.maxAlternatives = 1;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this.onresult = null;
    }
    start() {
      queueMicrotask(() => {
        this.onstart?.(new Event("start"));
        const transcript =
          "보고서 쓰기 메모 급함 마감 10월 30일부터 11월 2일 중요도 높음";
        const result = {
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript },
              length: 1,
            },
          ],
        };
        this.onresult?.(result);
        queueMicrotask(() => this.onend?.(new Event("end")));
      });
    }
    stop() {
      this.onend?.(new Event("end"));
    }
    abort() {
      this.onend?.(new Event("end"));
    }
  }
  window.SpeechRecognition = FakeRec;
  window.webkitSpeechRecognition = FakeRec;
});

const seed = {
  version: 5,
  tasks: [],
  checklists: [],
  calendarEvents: [],
  guidelines: [],
  habits: [],
  deletions: {},
};

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

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ seed, cheer }) => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-daily-cheer-kst", cheer);
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(seed));
  },
  { seed, cheer: cheerDayKey() },
);
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const cheer = page.locator("[data-daily-cheer]");
if ((await cheer.count()) > 0) {
  await page.locator("[data-daily-cheer-confirm]").click({ force: true });
  await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}
await page.waitForTimeout(300);

// Ensure 업무용 frame (not 전체) so 행 추가 + voice show
const frame = page.locator('[aria-label="틀"]');
await frame.selectOption("work");
await page.waitForTimeout(300);

const voiceBtn = page.locator("[data-excel-voice-add]");
await voiceBtn.waitFor({ state: "visible", timeout: 8000 });
await page.screenshot({
  path: join(OUT, "ilbiseo-voice-row-add-toolbar.png"),
  fullPage: false,
});

await voiceBtn.click();
const dialog = page.locator("[data-voice-row-dialog]");
await dialog.waitFor({ state: "visible", timeout: 5000 });
await page.waitForTimeout(400);

const title = page.locator("[data-voice-field-title]");
await title.waitFor({ state: "visible", timeout: 5000 });
const titleVal = await title.inputValue();
if (titleVal !== "보고서 쓰기") {
  throw new Error(`expected title 보고서 쓰기, got ${titleVal}`);
}
const memo = await page.locator("[data-voice-field-memo]").inputValue();
if (memo !== "급함") throw new Error(`memo=${memo}`);
const imp = await page.locator("[data-voice-field-importance]").inputValue();
if (imp !== "3") throw new Error(`importance=${imp}`);

await page.screenshot({
  path: join(OUT, "ilbiseo-voice-row-add-confirm.png"),
  fullPage: false,
});

await page.locator("[data-voice-confirm]").click();
await page.waitForTimeout(500);

const firstTitle = page.locator('textarea[aria-label="할 일"]').first();
await firstTitle.waitFor({ state: "visible", timeout: 5000 });
const added = await firstTitle.inputValue();
if (added !== "보고서 쓰기") {
  throw new Error(`row not added at top: ${added}`);
}

await page.screenshot({
  path: join(OUT, "ilbiseo-voice-row-add-result.png"),
  fullPage: false,
});

console.log("smoke-voice-row-add-ui: ok", { todayKst });
await browser.close();
