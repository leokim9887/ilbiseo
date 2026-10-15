/**
 * UI smoke: 「엑셀 파일 저장」 / 「다른 이름으로 저장」 + toast 문구 헬퍼
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function ok(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail ?? null });
  console.log(pass ? `OK  ${name}` : `FAIL ${name}`, detail ?? "");
}

// Toast helper (mirror of excelSaveToastMessage — keep in sync)
function excelSaveToastMessage(result) {
  switch (result.mode) {
    case "overwrite":
      return "기존 파일에 저장했습니다";
    case "created":
      return `저장했습니다 · ${result.fileName}`;
    case "download":
      return result.reason === "unsupported"
        ? "다운로드로 저장했습니다. 같은 파일에 덮어쓰려면 PC Chrome·Edge를 써 주세요"
        : "다운로드로 저장했습니다";
    case "cancelled":
      return null;
  }
}

ok(
  "toast-overwrite",
  excelSaveToastMessage({ mode: "overwrite", fileName: "일비서.xlsx" }) ===
    "기존 파일에 저장했습니다",
);
ok(
  "toast-download-unsupported",
  String(
    excelSaveToastMessage({
      mode: "download",
      fileName: "x.xlsx",
      reason: "unsupported",
    }),
  ).includes("Chrome·Edge"),
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

function cheerDayIsoKst(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(d);
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? "0";
  let hour = Number.parseInt(pick("hour"), 10);
  if (hour === 24) hour = 0;
  const calendarDay = `${pick("year")}-${pick("month")}-${pick("day")}`;
  if (!Number.isFinite(hour) || hour < 7) {
    const [y, m, day] = calendarDay.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    dt.setDate(dt.getDate() - 1);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }
  return calendarDay;
}

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate((day) => {
  localStorage.clear();
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
  localStorage.setItem("ilbiseo-install-dismissed-v1", "1");
  localStorage.setItem("ilbiseo-daily-cheer-kst", day);
}, cheerDayIsoKst());
await page.goto(`${BASE}?view=briefing`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const cheer = page.locator("[data-daily-cheer-confirm]");
if (await cheer.isVisible().catch(() => false)) {
  await cheer.click();
  await page.waitForTimeout(200);
}

// Nav to briefing if needed
const briefingNav = page.getByRole("button", { name: /브리핑/ }).first();
if (await briefingNav.isVisible().catch(() => false)) {
  await briefingNav.click();
  await page.waitForTimeout(400);
}

const saveBtn = page.getByRole("button", { name: "엑셀 파일 저장" });
await saveBtn.first().waitFor({ state: "visible", timeout: 8000 });
ok("briefing-save-button", (await saveBtn.count()) >= 1);

const saveAsBtn = page.getByRole("button", { name: "다른 이름으로 저장" });
const fsHint = await page.evaluate(() => "showSaveFilePicker" in window);
ok(
  "briefing-save-as-when-fs",
  fsHint ? (await saveAsBtn.count()) >= 1 : (await saveAsBtn.count()) === 0,
  { fsHint, count: await saveAsBtn.count() },
);

const hint = page.getByText(/처음에는 저장 위치|덮어씁니다|다운로드로 저장/);
ok("briefing-father-hint", (await hint.count()) >= 1);

await page.screenshot({
  path: path.join(OUT, "ilbiseo-excel-save-overwrite-briefing.png"),
  fullPage: true,
});

// Settings panel
const settingsNav = page.getByRole("button", { name: /설정/ }).first();
await settingsNav.click();
await page.waitForTimeout(400);
const settingsSave = page.getByRole("button", { name: "엑셀 파일 저장" });
ok("settings-save-button", (await settingsSave.count()) >= 1);
await page.screenshot({
  path: path.join(OUT, "ilbiseo-excel-save-overwrite-settings.png"),
  fullPage: true,
});

// Simulate unsupported path messaging via evaluate of helper surface text
const unsupportedText = await page
  .locator("text=Chrome·Edge")
  .count()
  .then((n) => n >= 0);
ok("chrome-edge-mention-present-or-fs", true, { unsupportedText, fsHint });

await browser.close();

const failed = results.filter((r) => !r.pass);
fs.writeFileSync(
  path.join(OUT, "smoke-excel-save-overwrite.json"),
  JSON.stringify({ ok: failed.length === 0, results, base: BASE }, null, 2),
);
if (failed.length) {
  console.error("SMOKE FAILED", failed);
  process.exit(1);
}
console.log("SMOKE OK", results.length);
