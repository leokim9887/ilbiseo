/**
 * Capture 「구분하기」 (under search) + group separator UI.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
mkdirSync(OUT, { recursive: true });

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

const today = cheerDayKey();
const seed = {
  version: 5,
  tasks: [
    {
      id: "t1",
      title: "병원 예약",
      category: "work",
      kind: "spot",
      startDate: today,
      targetDate: today,
      urgency: 2,
      importance: 3,
      groupKey: "병원",
      groupId: null,
      groupLabel: null,
      memo: "내과",
      source: "manual",
      status: "active",
      createdAt: "2026-11-08T01:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t2",
      title: "병원 약 타기",
      category: "work",
      kind: "spot",
      startDate: today,
      targetDate: today,
      urgency: 2,
      importance: 2,
      groupKey: "병원",
      groupId: null,
      groupLabel: null,
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-11-07T01:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t3",
      title: "팀 회의",
      category: "work",
      kind: "spot",
      startDate: today,
      targetDate: today,
      urgency: 2,
      importance: 2,
      groupKey: "팀",
      groupId: null,
      groupLabel: null,
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-11-06T01:00:00.000Z",
      completedAt: null,
    },
  ],
  checklists: [],
  calendarEvents: [],
  guidelines: [],
  habits: [],
  deletions: {},
};

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1100, height: 820 },
});
page.on("dialog", async (d) => d.accept());

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(
  ({ seed, cheer }) => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
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

await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(300);

// Select first two hospital rows
const selectCells = page.locator("[data-excel-select-cell]");
await selectCells.nth(0).click();
await selectCells.nth(1).click();
await page.waitForTimeout(200);

const groupBtn = page.locator("[data-excel-group-divider]");
await groupBtn.waitFor({ state: "visible", timeout: 5000 });

const barPath = join(OUT, "ilbiseo-todo-group-dividers-toolbar.png");
await page.locator("[data-excel-group-divider-bar]").screenshot({
  path: barPath,
});

await groupBtn.click();
await page.waitForTimeout(400);

const sep = page.locator("[data-excel-group-separator]");
await sep.waitFor({ state: "visible", timeout: 5000 });
const label = await page
  .locator("[data-excel-group-separator-label]")
  .textContent();

const sectionPath = join(OUT, "ilbiseo-todo-group-dividers-section.png");
// Capture table area including separator + clustered rows
await page.locator("table").first().screenshot({ path: sectionPath });

// Click a grouped row a few times — order must stay put (stability check)
const before = await page.locator("[data-excel-row]").evaluateAll((els) =>
  els.map((el) => el.getAttribute("data-excel-row")),
);
for (let i = 0; i < 3; i++) {
  await page.locator("[data-excel-grouped='1'] textarea").nth(i % 2).click();
  await page.waitForTimeout(120);
}
const after = await page.locator("[data-excel-row]").evaluateAll((els) =>
  els.map((el) => el.getAttribute("data-excel-row")),
);

const meta = {
  ok: true,
  label: (label || "").trim(),
  toolbarPath: barPath,
  sectionPath,
  sepCount: await sep.count(),
  ungroupVisible: (await page.locator("[data-excel-group-ungroup]").count()) > 0,
  rowOrderStable: JSON.stringify(before) === JSON.stringify(after),
  before,
  after,
};
console.log(JSON.stringify(meta, null, 2));
if (meta.label !== "병원") {
  console.error("unexpected label", meta.label);
  process.exit(1);
}
if (!meta.rowOrderStable) {
  console.error("row order jumped on click", meta.before, meta.after);
  process.exit(1);
}

await browser.close();
