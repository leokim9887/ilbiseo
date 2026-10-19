/**
 * Capture father-facing GCal reconnect UI with mocked expired-token APIs.
 * Usage: node scripts/capture-gcal-reconnect-ui.mjs http://127.0.0.1:4317 /path/out.png
 */
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:4317";
const out = process.argv[3] || path.resolve("gcal-reconnect-ui.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1100, height: 900 },
  deviceScaleFactor: 1,
});

await page.route("**/api/google/status", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      configured: true,
      connected: false,
      email: "goldage64@gmail.com",
      needsReconnect: true,
      error: "구글 연결이 만료됐습니다. 다시 연결해 주세요.",
      missing: [],
      setupHint: "",
    }),
  });
});

await page.route("**/api/google/events**", async (route) => {
  await route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({
      error: "구글 연결이 만료됐습니다. 다시 연결해 주세요.",
      needsReconnect: true,
    }),
  });
});

await page.goto(`${base}/?view=calendar`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// Prefer the calendar status box with reconnect CTA
const box = page.locator('text=연결 만료').first();
await box.waitFor({ timeout: 15000 });
const panel = page.locator("text=구글 캘린더").first();
const shotTarget = page.locator('div.rounded-xl.border').filter({ hasText: "다시 연결" }).first();
await shotTarget.screenshot({ path: out });
console.log("wrote", out, fs.statSync(out).size);
await browser.close();
