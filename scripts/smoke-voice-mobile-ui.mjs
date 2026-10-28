/**
 * Smoke: voice sheet — 추가 기능 menu, confirm fields, 직접 적기, safe-area dialog.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SamsungBrowser/24.0",
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
          "업무용에 보고서 쓰기 메모 급함 마감 언젠가 중요도 높음";
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

const seed = {
  version: 5,
  tasks: [],
  checklists: [],
  calendarEvents: [],
  guidelines: [],
  habits: [],
  deletions: {},
};

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
await page.waitForTimeout(400);
const cheer = page.locator("[data-daily-cheer]");
if ((await cheer.count()) > 0) {
  await page.locator("[data-daily-cheer-confirm]").click({ force: true });
  await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}

await page.locator('select[aria-label="틀"]').selectOption("work");
await page.locator("[data-toolbar-extras]").click();
await page.locator("[data-toolbar-extras-voice]").click();

const dialog = page.locator("[data-voice-row-dialog]");
await dialog.waitFor({ state: "visible", timeout: 5000 });
await page.waitForTimeout(500);

await page.locator("[data-voice-field-title]").waitFor({ state: "visible" });
const title = await page.locator("[data-voice-field-title]").inputValue();
if (title !== "보고서 쓰기") throw new Error(`title=${title}`);
const cat = await page.locator("[data-voice-field-category]").inputValue();
if (cat !== "work") throw new Error(`cat=${cat}`);

// Touch targets — listen / manual / confirm
for (const sel of [
  "[data-voice-manual]",
  "[data-voice-confirm]",
  "[data-voice-cancel]",
]) {
  const box = await page.locator(sel).boundingBox();
  if (!box || box.height < 40) throw new Error(`${sel} touch target too small: ${box?.height}`);
}

await page.screenshot({
  path: join(OUT, "ilbiseo-voice-mobile-samsung-sheet.png"),
  fullPage: false,
});

await page.locator("[data-voice-manual]").click();
await page.waitForTimeout(200);
await page.locator("[data-voice-manual-hint]").waitFor({ state: "visible" });
await page.locator("[data-voice-field-title]").fill("직접적은할일");
await page.screenshot({
  path: join(OUT, "ilbiseo-voice-mobile-manual.png"),
  fullPage: false,
});

await page.locator("[data-voice-confirm]").click();
await page.waitForTimeout(500);
const added = await page.locator('textarea[aria-label="할 일"]').first().inputValue();
if (added !== "직접적은할일") throw new Error(`added=${added}`);

// iPhone UA — unsupported path when no SpeechRecognition
const ios = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
ios.on("dialog", async (d) => d.accept());
await ios.addInitScript(() => {
  // No SpeechRecognition — simulate limited iOS
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});
await ios.goto(BASE, { waitUntil: "domcontentloaded" });
await ios.evaluate(
  ({ seed, cheer }) => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-daily-cheer-kst", cheer);
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(seed));
  },
  { seed, cheer: cheerDayKey() },
);
await ios.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await ios.waitForTimeout(400);
const cheerIos = ios.locator("[data-daily-cheer]");
if ((await cheerIos.count()) > 0) {
  await ios.locator("[data-daily-cheer-confirm]").click({ force: true });
  await cheerIos.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}
await ios.locator('select[aria-label="틀"]').selectOption("work");
await ios.locator("[data-toolbar-extras]").click();
await ios.locator("[data-toolbar-extras-voice]").click();
await ios.locator("[data-voice-row-dialog]").waitFor({ state: "visible" });
await ios.locator("[data-voice-unsupported]").waitFor({ state: "visible", timeout: 5000 });
const unsup = await ios.locator("[data-voice-unsupported]").innerText();
if (!unsup.includes("iPhone") && !unsup.includes("직접 적기")) {
  throw new Error(`ios copy=${unsup}`);
}
await ios.locator("[data-voice-field-title]").fill("아이폰직접입력");
await ios.screenshot({
  path: join(OUT, "ilbiseo-voice-mobile-ios-fallback.png"),
  fullPage: false,
});
await ios.locator("[data-voice-confirm]").click();
await ios.waitForTimeout(500);
const iosAdded = await ios
  .locator('textarea[aria-label="할 일"]')
  .first()
  .inputValue();
if (iosAdded !== "아이폰직접입력") throw new Error(`iosAdded=${iosAdded}`);
await ios.close();

console.log(JSON.stringify({ ok: true, samsungTitle: added, iosTitle: iosAdded }));
await browser.close();
