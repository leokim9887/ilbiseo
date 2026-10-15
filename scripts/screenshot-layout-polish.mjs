/**
 * Capture father-friendly layout polish screenshots for handoff.
 * Requires: npm run dev on :4317
 */
import { chromium, devices } from "playwright";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

const BASE = process.env.ILBISEO_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

const STORAGE_KEY = "ilbiseo-state-v2";
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Seoul",
});

function seedState() {
  const now = new Date().toISOString();
  return {
    version: 3,
    tasks: [
      {
        id: "t1",
        title: "헤드헌팅 후보 전화",
        category: "work",
        kind: "spot",
        startDate: today,
        targetDate: today,
        urgency: 2,
        importance: 3,
        groupKey: "헤드헌팅 후보 전화",
        memo: "오전 중",
        source: "manual",
        status: "active",
        createdAt: now,
        completedAt: null,
      },
      {
        id: "t2",
        title: "제안서 초안 검토",
        category: "work",
        kind: "ongoing",
        startDate: today,
        targetDate: today,
        urgency: 2,
        importance: 2,
        groupKey: "제안서 초안 검토",
        memo: "",
        source: "manual",
        status: "active",
        createdAt: now,
        completedAt: null,
      },
      {
        id: "t3",
        title: "완료한 미팅 정리",
        category: "work",
        kind: "spot",
        startDate: today,
        targetDate: today,
        urgency: 1,
        importance: 2,
        groupKey: "완료한 미팅 정리",
        memo: "",
        source: "manual",
        status: "completed",
        createdAt: now,
        completedAt: now,
      },
    ],
    checklists: [],
    calendarEvents: [
      {
        id: "c1",
        title: "고객 미팅",
        start: `${today}T10:00:00+09:00`,
        end: `${today}T11:00:00+09:00`,
        allDay: false,
        location: "",
        notes: "",
        calendarName: "일비서",
        source: "google",
      },
      {
        id: "c2",
        title: "주간 리뷰",
        start: today,
        end: today,
        allDay: true,
        location: "",
        notes: "",
        calendarName: "일비서",
        source: "google",
      },
    ],
    guidelines: [
      {
        id: "g1",
        title: "매일 오전 메일함 확인",
        memo: "짧게",
        done: false,
        createdAt: now,
        completedAt: null,
      },
    ],
    habits: [
      {
        id: "h1",
        title: "산책 20분",
        memo: "저녁",
        done: false,
        createdAt: now,
        completedAt: null,
      },
    ],
  };
}

async function dismissOverlays(page) {
  // Ace cheer / welcome may block — close if present
  for (const sel of [
    '[data-cheer-dismiss]',
    'button:has-text("닫기")',
    'button:has-text("확인")',
    'button:has-text("시작")',
    'button:has-text("알겠어요")',
  ]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

async function gotoSeeded(page, path = "/", theme = "light") {
  await page.addInitScript(
    ({ key, state, themeMode, cheerDay }) => {
      localStorage.setItem(key, JSON.stringify(state));
      localStorage.setItem("ilbiseo-theme", themeMode);
      // Skip Ace cheer / welcome for clean screenshots
      localStorage.setItem("ilbiseo-daily-cheer-kst", cheerDay);
      localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
      // Cheer day key uses KST 07:00 boundary — stamp both calendar day and prev
      localStorage.setItem("ilbiseo-daily-cheer-kst", cheerDay);
    },
    {
      key: STORAGE_KEY,
      state: seedState(),
      themeMode: theme,
      cheerDay: today,
    },
  );
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  // Dismiss welcome / cheer if still open
  for (const label of ["시작하기", "시작", "확인", "알겠어요", "닫기"]) {
    const btn = page.getByRole("button", { name: label }).first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  await dismissOverlays(page);
}

async function shot(page, name) {
  const file = join(OUT, name);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function selectFrame(page, label) {
  const sel = page.locator('select[aria-label="틀"]');
  if (await sel.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sel.selectOption({ label });
    await page.waitForTimeout(400);
  }
}

async function runDesktop(browser) {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
  });
  await gotoSeeded(page);
  // Ensure sheet is visible (scroll past banner)
  await page.locator(".excel-wb").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  // PC 마감목표 wider — todo sheet table
  const table = page.locator("[data-excel-scroll]").first();
  await table.scrollIntoViewIfNeeded();
  await shot(page, "ilbiseo-layout-pc-deadline-wider.png");

  // Select a row so bulk actions show next to 추가 기능
  const check = page.locator("[data-excel-row-check]").first();
  if (await check.isVisible().catch(() => false)) {
    await check.click({ force: true });
    await page.waitForTimeout(300);
  }
  await page.locator("[data-excel-bulk-row]").scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "ilbiseo-layout-pc-bulk-with-extras.png");

  // Google Calendar frame — no importance/done
  await selectFrame(page, "구글 캘린더");
  await page.waitForTimeout(500);
  await page.locator(".excel-wb").first().scrollIntoViewIfNeeded();
  await shot(page, "ilbiseo-layout-calendar-no-importance-done.png");

  // 지침 & 습관 — no per-row delete
  await page.getByRole("button", { name: /할 일/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await selectFrame(page, "업무용");
  await page.evaluate(() => {
    document.querySelector("[data-side-kind='habit']")?.scrollIntoView({
      block: "center",
    });
  });
  await page.waitForTimeout(400);
  await shot(page, "ilbiseo-layout-habits-no-delete.png");

  // Theme: settings nav
  await page.getByRole("button", { name: /설정/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-theme-option="light"]').click().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator("[data-theme-settings]").scrollIntoViewIfNeeded();
  await shot(page, "ilbiseo-layout-theme-light.png");

  await page.locator('[data-theme-option="dark"]').click();
  await page.waitForTimeout(400);
  await page.locator("[data-theme-settings]").scrollIntoViewIfNeeded();
  await shot(page, "ilbiseo-layout-theme-dark.png");

  await page.close();
}

async function runMobile(browser) {
  const iPhone = devices["iPhone 12"];
  const context = await browser.newContext({
    ...iPhone,
    locale: "ko-KR",
  });
  const page = await context.newPage();
  await gotoSeeded(page);

  // Mobile todo — no 완료 col, wider deadline
  await shot(page, "ilbiseo-layout-mobile-no-complete-col.png");

  // Select rows → bulk next to 추가 기능
  const check = page.locator("[data-excel-row-check]").first();
  if (await check.isVisible().catch(() => false)) {
    await check.click({ force: true });
    await page.waitForTimeout(400);
  }
  const bulkRow = page.locator("[data-excel-bulk-row]");
  await bulkRow.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(200);
  // Crop to toolbar + table header for clear evidence
  const box = await bulkRow.boundingBox();
  if (box) {
    await page.screenshot({
      path: join(OUT, "ilbiseo-layout-mobile-bulk-next-to-extras.png"),
      clip: {
        x: 0,
        y: Math.max(0, box.y - 8),
        width: page.viewportSize().width,
        height: Math.min(280, page.viewportSize().height - Math.max(0, box.y - 8)),
      },
    });
    console.log("wrote", join(OUT, "ilbiseo-layout-mobile-bulk-next-to-extras.png"));
  } else {
    await shot(page, "ilbiseo-layout-mobile-bulk-next-to-extras.png");
  }

  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await runDesktop(browser);
  await runMobile(browser);
} finally {
  await browser.close();
}
console.log("done");
