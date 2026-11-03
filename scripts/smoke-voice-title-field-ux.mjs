/**
 * Smoke + screenshot: voice 「할 일」 field padding / auto-grow / no-x-scroll.
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
          "업무용에 긴 보고서 초안 쓰기 메모 팀장님 검토용으로 정리해서 보내기 마감 언젠가 중요도 높음";
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
await page.locator("[data-voice-field-title]").waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(200);

const metrics = await page.locator("[data-voice-field-title]").evaluate((el) => {
  const cs = getComputedStyle(el);
  const padTop = parseFloat(cs.paddingTop);
  const padBottom = parseFloat(cs.paddingBottom);
  const lineHeight = cs.lineHeight;
  const fontSize = parseFloat(cs.fontSize);
  const resize = cs.resize;
  const scrollH = el.scrollHeight;
  const clientH = el.clientHeight;
  const rect = el.getBoundingClientRect();
  return {
    padTop,
    padBottom,
    lineHeight,
    fontSize,
    resize,
    scrollH,
    clientH,
    height: rect.height,
    value: el.value,
  };
});

if (metrics.resize !== "none") {
  throw new Error(`expected resize:none, got ${metrics.resize}`);
}
if (metrics.padTop < 8 || metrics.padBottom < 8) {
  throw new Error(
    `expected comfortable vertical padding, got ${metrics.padTop}/${metrics.padBottom}`,
  );
}
if (metrics.fontSize < 15) {
  throw new Error(`expected >=16px mobile font, got ${metrics.fontSize}`);
}
if (metrics.height < 44) {
  throw new Error(`title field too short: ${metrics.height}`);
}

const beforeH = metrics.height;

// Grow with long multi-line content
const long =
  "긴 할 일 제목입니다 — 첫 줄\n둘째 줄 메모처럼 이어지는 내용\n셋째 줄까지 길어서 높이가 늘어나야 합니다";
await page.locator("[data-voice-field-title]").fill(long);
await page.waitForTimeout(120);

const grown = await page.locator("[data-voice-field-title]").evaluate((el) => {
  const rect = el.getBoundingClientRect();
  return {
    height: rect.height,
    scrollH: el.scrollHeight,
    clientH: el.clientHeight,
    resize: getComputedStyle(el).resize,
  };
});
if (grown.height <= beforeH) {
  throw new Error(
    `auto-grow failed: before=${beforeH} after=${grown.height}`,
  );
}
if (Math.abs(grown.scrollH - grown.clientH) > 2) {
  throw new Error(
    `inner scroll unexpected: scroll=${grown.scrollH} client=${grown.clientH}`,
  );
}

const overflow = await page.evaluate(() => {
  const dialog = document.querySelector("[data-voice-row-dialog]");
  const body =
    dialog?.querySelector(".overflow-y-auto, [class*='overflow-y-auto']") ??
    null;
  const check = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      overflowX: cs.overflowX,
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
      wobble: el.scrollWidth - el.clientWidth,
    };
  };
  return {
    dialog: check(dialog),
    body: check(body),
    docWobble: document.documentElement.scrollWidth - window.innerWidth,
  };
});

if (overflow.docWobble > 1) {
  throw new Error(`page horizontal wobble: ${overflow.docWobble}`);
}
if (overflow.dialog && overflow.dialog.wobble > 2) {
  throw new Error(`dialog horizontal wobble: ${overflow.dialog.wobble}`);
}
if (
  overflow.body &&
  overflow.body.wobble > 2 &&
  !["hidden", "clip"].includes(overflow.body.overflowX)
) {
  throw new Error(
    `body overflow-x=${overflow.body.overflowX} wobble=${overflow.body.wobble}`,
  );
}

const shot = join(OUT, "ilbiseo-voice-title-field-ux-mobile.png");
await dialog.screenshot({ path: shot });

console.log(
  JSON.stringify(
    {
      ok: true,
      metrics,
      grown,
      overflow,
      shot,
    },
    null,
    2,
  ),
);

await browser.close();
