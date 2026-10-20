/**
 * Capture dark-mode 「비슷한 할 일」 dialog for readability check.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://127.0.0.1:43167";
const OUT =
  process.env.OUT_DIR ||
  join(
    "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3",
    "media",
  );
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 420, height: 720 },
  colorScheme: "dark",
});

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

await page.evaluate((todayIso) => {
  localStorage.clear();
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
  localStorage.setItem("ilbiseo-install-dismissed-v1", "1");
  localStorage.setItem("ilbiseo-theme", "dark");
  // Suppress Ace daily cheer for capture
  localStorage.setItem("ilbiseo-daily-cheer-kst", todayIso);
  document.documentElement.classList.add("dark");
  const now = new Date().toISOString();
  localStorage.setItem(
    "ilbiseo-state-v2",
    JSON.stringify({
      version: 3,
      tasks: [
        {
          id: "t-peer",
          title: "지계문사장님 방문 준비",
          category: "work",
          kind: "spot",
          startDate: todayIso,
          targetDate: todayIso,
          urgency: 2,
          importance: 2,
          groupKey: "지계",
          memo: "",
          source: "manual",
          status: "active",
          createdAt: now,
          completedAt: null,
        },
        {
          id: "t-edit",
          title: "새 할일",
          category: "work",
          kind: "spot",
          startDate: todayIso,
          targetDate: todayIso,
          urgency: 2,
          importance: 2,
          groupKey: "새",
          memo: "",
          source: "manual",
          status: "active",
          createdAt: now,
          completedAt: null,
        },
      ],
      checklists: [],
      calendarEvents: [],
      guidelines: [],
      habits: [],
      theme: "dark",
      updatedAt: now,
    }),
  );
}, today);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);

await page.evaluate(() => {
  document.documentElement.classList.add("dark");
});

const cheer = page.locator("[data-daily-cheer]");
if (await cheer.isVisible().catch(() => false)) {
  await page.locator("[data-daily-cheer-confirm]").click({ force: true });
  await cheer.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}

await page.locator('select[aria-label="틀"]').selectOption("work").catch(() => {});
await page.waitForTimeout(200);

const row = page.locator('tr[data-excel-row="t-edit"]');
const title = row.locator('textarea[aria-label="할 일"]');
await title.click();
await title.fill("지계문사장님 방문");
await title.blur();
await page.waitForTimeout(1000);

const alert = page.locator("[data-similarity-alert]");
await alert.waitFor({ state: "visible", timeout: 8000 });

const colors = await alert.evaluate((el) => {
  const titleEl = el.querySelector('[data-slot="dialog-title"]');
  const descEl = el.querySelector('[data-slot="dialog-description"]');
  const t = titleEl ? getComputedStyle(titleEl).color : "";
  const d = descEl ? getComputedStyle(descEl).color : "";
  const parse = (c) => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  };
  const luminance = ({ r, g, b }) =>
    0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  const tp = parse(t);
  const dp = parse(d);
  return {
    title: t,
    desc: d,
    titleLum: tp ? luminance(tp) : -1,
    descLum: dp ? luminance(dp) : -1,
  };
});

if (colors.titleLum < 0.55 || colors.descLum < 0.45) {
  throw new Error(
    `dark dialog text still too dark: ${JSON.stringify(colors)}`,
  );
}

const outPath = join(OUT, "ilbiseo-similar-todo-dark-fixed.png");
await page.screenshot({ path: outPath });
console.log(JSON.stringify({ ok: true, outPath, colors }, null, 2));
await browser.close();
