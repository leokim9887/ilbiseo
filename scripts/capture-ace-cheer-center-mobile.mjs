/**
 * Capture Ace cheer overlay — phone viewport, vertically+horizontally centered.
 * Asserts stage center is near viewport center (TEMP FORCE_CHEER must be on).
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/self/media";
const ART = "/opt/cursor/artifacts";
const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4331/";
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

async function seed(context) {
  await context.addInitScript((payload) => {
    localStorage.setItem("ilbiseo-state-v2", JSON.stringify(payload));
    localStorage.removeItem("ilbiseo-daily-cheer-kst");
    localStorage.setItem("ilbiseo-daily-cheer-idx", "0");
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem("ilbiseo-install-dismissed-v2", String(Date.now()));
  }, SEED);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const viewport = { width: 390, height: 844 };
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await seed(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1200);

  const stage = await page.locator(".cheer-stage").boundingBox();
  if (!stage) throw new Error("cheer-stage missing");

  const stageCx = stage.x + stage.width / 2;
  const stageCy = stage.y + stage.height / 2;
  const viewCx = viewport.width / 2;
  const viewCy = viewport.height / 2;
  const dx = Math.abs(stageCx - viewCx);
  const dy = Math.abs(stageCy - viewCy);

  console.log("center-check", {
    stage,
    stageCx,
    stageCy,
    viewCx,
    viewCy,
    dx: Math.round(dx),
    dy: Math.round(dy),
  });

  // Horizontal: tight; vertical: allow CTA below face (~80px slack for button stack)
  if (dx > 12) throw new Error(`not horizontally centered: dx=${dx}`);
  if (dy > 90) {
    throw new Error(
      `not vertically centered (still too low/high): dy=${dy} stageCy=${stageCy} viewCy=${viewCy}`,
    );
  }
  // Must not sit in the bottom third (the previous bug)
  if (stage.y > viewport.height * 0.45) {
    throw new Error(`stage still too low: top=${stage.y}`);
  }

  const name = "ilbiseo-ace-cheer-center-mobile.png";
  const tmp = path.join(ART, `_tmp-${name}`);
  await page.screenshot({ path: tmp, fullPage: false });
  const out = path.join(OUT, name);
  fs.copyFileSync(tmp, out);
  fs.copyFileSync(out, path.join(ART, name));
  console.log("wrote", out);

  // Second load proves FORCE_CHEER_EVERY_LOAD (ignore prior dismiss day key)
  await page.locator("[data-daily-cheer-confirm]").click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-daily-cheer]").waitFor({ state: "visible", timeout: 15000 });
  console.log("force-reload-ok: cheer reappeared after dismiss+refresh");

  await ctx.close();
  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
