import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4317/";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const now = "2026-10-10T00:00:00.000Z";
const SEED = {
  version: 3,
  tasks: [
    {
      id: "t1",
      title: "헤드헌팅 후보 리스트 정리",
      memo: "A급",
      category: "work",
      kind: "spot",
      importance: 3,
      urgency: 2,
      startDate: "2026-10-12",
      targetDate: "2026-10-15",
      groupKey: "헤드헌팅",
      source: "manual",
      status: "active",
      completedAt: null,
      createdAt: now,
    },
  ],
  checklists: [],
  guidelines: [],
  habits: [],
  calendarEvents: Array.from({ length: 3 }, (_, i) => ({
    id: `c${i}`,
    title: `일정 ${i + 1}`,
    start: now,
    end: now,
    allDay: true,
    source: "manual",
  })),
  excelLink: null,
  emailBriefing: null,
  updatedAt: now,
};

function cheerDayKey() {
  return `(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    let y = Number(get("year"));
    let m = Number(get("month"));
    let d = Number(get("day"));
    const hour = Number(get("hour"));
    if (hour < 7) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 1);
      y = dt.getUTCFullYear();
      m = dt.getUTCMonth() + 1;
      d = dt.getUTCDate();
    }
    const key = \`\${y}-\${String(m).padStart(2, "0")}-\${String(d).padStart(2, "0")}\`;
    localStorage.setItem("ilbiseo-daily-cheer-kst", key);
  })()`;
}

async function seed(ctx) {
  await ctx.addInitScript((payload) => {
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  }, SEED);
  await ctx.addInitScript(cheerDayKey());
}

async function shot(page, name, clip) {
  const p1 = path.join(OUT, name);
  await page.screenshot(clip ? { path: p1, clip } : { path: p1 });
  fs.copyFileSync(p1, path.join(ART, name));
  console.log("wrote", p1);
}

async function dismissCheerIfAny(page) {
  const cheer = page.locator("[data-daily-cheer]");
  if (await cheer.count()) {
    const btn = page.locator("[data-daily-cheer-confirm]");
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(400);
  }
}

/** Tiny solid JPEG via canvas in page — used as custom banner bg. */
async function makeCustomJpeg(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 800, 400);
    g.addColorStop(0, "#1a3a4a");
    g.addColorStop(0.5, "#2d5a3d");
    g.addColorStop(1, "#0f2430");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 800, 400);
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,220,140,${0.15 + Math.random() * 0.4})`;
      ctx.arc(
        Math.random() * 800,
        Math.random() * 400,
        2 + Math.random() * 6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    const buf = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buf));
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Settings panel shot
  {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 1100 },
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(`${BASE}?view=settings`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await dismissCheerIfAny(page);
    await page.waitForSelector("[data-banner-bg-settings]", { timeout: 15000 });
    await page.waitForTimeout(500);
    const panel = page.locator("[data-banner-bg-settings]");
    await shot(page, "ilbiseo-banner-settings.png");
    const box = await panel.boundingBox();
    if (box) {
      await shot(page, "ilbiseo-banner-settings-panel.png", {
        x: Math.max(0, box.x - 8),
        y: Math.max(0, box.y - 8),
        width: Math.min(box.width + 16, 1100),
        height: Math.min(box.height + 16, 900),
      });
    }
    await ctx.close();
  }

  // After custom bg — banner overlays still readable
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(`${BASE}?view=settings`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await dismissCheerIfAny(page);
    await page.waitForSelector("[data-banner-bg-settings]", { timeout: 15000 });

    const bytes = await makeCustomJpeg(page);
    const tmp = path.join("/tmp", "ilbiseo-custom-banner.jpg");
    fs.writeFileSync(tmp, Buffer.from(bytes));

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("[data-banner-bg-pick-both]").click(),
    ]);
    await fileChooser.setFiles(tmp);
    await page.waitForSelector("text=내가 고른 사진", { timeout: 10000 });
    await page.waitForTimeout(600);

    // Back to todo so banner is prominent
    await page.getByRole("button", { name: "할 일", exact: true }).first().click();
    await page.waitForSelector("[data-family-banner]", { timeout: 10000 });
    await page.waitForTimeout(400);

    const banner = page.locator("[data-family-banner]");
    const box = await banner.boundingBox();
    if (box) {
      await shot(page, "ilbiseo-banner-settings-custom.png", {
        x: Math.max(0, box.x),
        y: Math.max(0, box.y),
        width: box.width,
        height: box.height,
      });
    }
    await shot(page, "ilbiseo-banner-settings-custom-full.png");
    await ctx.close();
  }

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
