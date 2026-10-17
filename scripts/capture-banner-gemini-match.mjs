import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4334/";
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
  calendarEvents: [],
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
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 } });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("[data-family-banner]", { timeout: 30000 });
    await dismissCheerIfAny(page);
    await page.waitForTimeout(500);
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) await shot(page, "ilbiseo-banner-gemini-match-pc.png", box);
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await seed(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("[data-family-banner]", { timeout: 30000 });
    await dismissCheerIfAny(page);
    await page.waitForTimeout(500);
    const box = await page.locator("[data-family-banner]").boundingBox();
    if (box) await shot(page, "ilbiseo-banner-gemini-match-mobile.png", box);
    await ctx.close();
  }

  await browser.close();

  // Asset copies + ref-vs-ours compare strip
  fs.copyFileSync(
    "/workspace/public/ilbiseo-family-banner-pc.jpg",
    path.join(OUT, "ilbiseo-banner-gemini-match-pc-asset.jpg"),
  );
  fs.copyFileSync(
    "/workspace/public/ilbiseo-family-banner-mobile.jpg",
    path.join(OUT, "ilbiseo-banner-gemini-match-mobile-asset.jpg"),
  );

  const { spawnSync } = await import("child_process");
  const py = `
from PIL import Image
ref = Image.open("/cursor/stores/self/media/ui-refs/gemini-banner-inspiration.png").convert("RGB")
ours = Image.open("/workspace/public/ilbiseo-family-banner-pc.jpg").convert("RGB")
w = 1680
ref = ref.resize((w, int(ref.height * w / ref.width)), Image.Resampling.LANCZOS)
ours = ours.resize((w, int(ours.height * w / ours.width)), Image.Resampling.LANCZOS)
gap = Image.new("RGB", (w, 12), (24, 28, 32))
out = Image.new("RGB", (w, ref.height + gap.height + ours.height), (24, 28, 32))
out.paste(ref, (0, 0))
out.paste(gap, (0, ref.height))
out.paste(ours, (0, ref.height + gap.height))
out.save("/cursor/stores/self/media/ilbiseo-banner-gemini-match-compare.png", "PNG", optimize=True)
print("compare", out.size)
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  console.log(r.stdout || r.stderr);
  if (r.status !== 0) process.exit(r.status || 1);
  fs.copyFileSync(
    path.join(OUT, "ilbiseo-banner-gemini-match-compare.png"),
    path.join(ART, "ilbiseo-banner-gemini-match-compare.png"),
  );
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
