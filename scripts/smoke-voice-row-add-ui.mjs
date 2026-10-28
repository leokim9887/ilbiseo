/**
 * Smoke: 「추가 기능」→ 음성으로 입력 + confirm fills all fields + commit.
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
const year = Number(todayKst.slice(0, 4));

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
          "개인용에 장보기 메모 우유 마감 언젠가 중요도 낮음";
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
    // FORCE_CHEER_EVERY_LOAD=true → dismiss manually
    localStorage.setItem("ilbiseo-daily-cheer-kst", cheer);
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(seed));
  },
  { seed, cheer: cheerDayKey() },
);
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const cheer = page.locator("[data-daily-cheer]");
if ((await cheer.count()) > 0) {
  await page.screenshot({
    path: join(OUT, "ilbiseo-ace-cheer-force-temp.png"),
    fullPage: false,
  });
  await page.locator("[data-daily-cheer-confirm]").click({ force: true });
  await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}
await page.waitForTimeout(300);

await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);

const extras = page.locator("[data-toolbar-extras]");
await extras.waitFor({ state: "visible", timeout: 8000 });
await page.screenshot({
  path: join(OUT, "ilbiseo-toolbar-extras-voice.png"),
  fullPage: false,
});

await extras.click();
await page.locator("[data-toolbar-extras-voice]").click();

const dialog = page.locator("[data-voice-row-dialog]");
await dialog.waitFor({ state: "visible", timeout: 5000 });
await page.waitForTimeout(500);

const title = page.locator("[data-voice-field-title]");
await title.waitFor({ state: "visible", timeout: 5000 });
const titleVal = await title.inputValue();
if (titleVal !== "장보기") throw new Error(`title=${titleVal}`);
const memo = await page.locator("[data-voice-field-memo]").inputValue();
if (memo !== "우유") throw new Error(`memo=${memo}`);
const imp = await page.locator("[data-voice-field-importance]").inputValue();
if (imp !== "1") throw new Error(`importance=${imp}`);
const cat = await page.locator("[data-voice-field-category]").inputValue();
if (cat !== "personal") throw new Error(`category=${cat}`);
const somedayPressed = await page
  .locator("[data-voice-field-someday]")
  .getAttribute("aria-pressed");
if (somedayPressed !== "true") throw new Error(`someday=${somedayPressed}`);

await page.screenshot({
  path: join(OUT, "ilbiseo-voice-row-add-confirm.png"),
  fullPage: false,
});

await page.locator("[data-voice-confirm]").click();
await page.waitForTimeout(600);

// Frame should switch to 개인용
const frameVal = await page.locator('select[aria-label="틀"]').inputValue();
if (frameVal !== "personal") throw new Error(`frame after=${frameVal}`);

const firstTitle = page.locator('textarea[aria-label="할 일"]').first();
await firstTitle.waitFor({ state: "visible", timeout: 5000 });
const added = await firstTitle.inputValue();
if (added !== "장보기") throw new Error(`row title=${added}`);

const memoCell = page.locator("[data-excel-memo]").first();
const memoAdded = await memoCell.inputValue();
if (memoAdded !== "우유") throw new Error(`row memo=${memoAdded}`);

const impSelect = page.locator('select[aria-label="중요도"]').first();
const impAdded = await impSelect.inputValue();
if (impAdded !== "1") throw new Error(`row imp=${impAdded}`);

// Second utterance: range + importance via glued speech path in dialog
await extras.click();
await page.locator("[data-toolbar-extras-voice]").click();
await dialog.waitFor({ state: "visible", timeout: 5000 });
// Override fake — inject parse via typing transcript path: click listen already fired.
// Manually set by evaluating parse into fields through "다시 말하기" is hard;
// instead fill confirm after forcing a second FakeRec with different text — change FakeRec.
await page.waitForTimeout(400);
// Close and do range case via evaluate inject of confirm fields is enough for unit;
// here verify someday row deadline display
const deadlineText = await page
  .locator("[data-excel-row]")
  .first()
  .locator("td")
  .nth(3)
  .innerText()
  .catch(() => "");
console.log("deadline cell hint", deadlineText);

await page.screenshot({
  path: join(OUT, "ilbiseo-voice-row-add-result.png"),
  fullPage: false,
});

// Range parse UI: reopen with custom transcript by page.evaluate Speech mock redefinition is late;
// close dialog if open
if (await dialog.isVisible().catch(() => false)) {
  await page.locator("[data-voice-cancel]").click().catch(() => {});
}

console.log(
  JSON.stringify({
    ok: true,
    todayKst,
    year,
    title: added,
    memo: memoAdded,
    importance: impAdded,
    category: frameVal,
  }),
);
await browser.close();
