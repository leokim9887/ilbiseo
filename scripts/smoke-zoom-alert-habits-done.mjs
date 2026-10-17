/**
 * Smoke: viewport no-zoom · similarity self-row never alerts ·
 * peer alert + scroll highlight · 지침/습관 완료 → 한 일 only
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://127.0.0.1:43145";
const OUT =
  process.env.OUT_DIR ||
  join(
    "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3",
    "media",
  );
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
});

await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

// Viewport meta: user-scalable=no · maximum-scale=1
const viewportMeta = await page.evaluate(() => {
  const m = document.querySelector('meta[name="viewport"]');
  return m?.getAttribute("content") || "";
});
const zoomLocked =
  /maximum-scale\s*=\s*1/i.test(viewportMeta) &&
  (/user-scalable\s*=\s*no/i.test(viewportMeta) ||
    /user-scalable\s*=\s*0/i.test(viewportMeta));
if (!zoomLocked) {
  throw new Error(`viewport not zoom-locked: ${viewportMeta}`);
}

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

await page.evaluate((todayIso) => {
  localStorage.clear();
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
  localStorage.setItem("ilbiseo-install-dismissed-v1", "1");
  const now = new Date().toISOString();
  localStorage.setItem(
    "ilbiseo-state-v2",
    JSON.stringify({
      version: 3,
      tasks: [
        {
          id: "t-peer",
          title: "세금 신고 서류",
          category: "work",
          kind: "spot",
          startDate: todayIso,
          targetDate: todayIso,
          urgency: 2,
          importance: 2,
          groupKey: "세금",
          memo: "국세청",
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
      guidelines: [
        {
          id: "g-open",
          title: "아침 스트레칭",
          memo: "",
          done: false,
          createdAt: now,
          completedAt: null,
        },
        {
          id: "g-done",
          title: "약 복용",
          memo: "식후",
          done: true,
          createdAt: now,
          completedAt: now,
        },
      ],
      habits: [
        {
          id: "h-open",
          title: "물 마시기",
          memo: "",
          done: false,
          createdAt: now,
          completedAt: null,
        },
        {
          id: "h-done",
          title: "산책",
          memo: "30분",
          done: true,
          createdAt: now,
          completedAt: now,
        },
      ],
    }),
  );
}, today);

await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.locator('select[aria-label="틀"]').selectOption("work");
await page.waitForTimeout(200);

// Self-row: same title+memo on one row → no alert
const rowEdit = page.locator('tr[data-excel-row="t-edit"]');
const titleEdit = rowEdit.locator('textarea[aria-label="할 일"]');
const memoEdit = rowEdit.locator('textarea[aria-label="메모"]');
await titleEdit.fill("혼자만 쓰는 긴문구알파");
await memoEdit.fill("혼자만 쓰는 긴문구알파");
await memoEdit.blur();
await page.waitForTimeout(500);
const selfAlertVisible = await page
  .locator("[data-similarity-alert]")
  .isVisible()
  .catch(() => false);
if (selfAlertVisible) {
  throw new Error("self-row title∩memo must NOT open similarity alert");
}

// Peer overlap → alert + peer highlighted
await titleEdit.fill("세금 신고 서류 점검");
await titleEdit.blur();
await page.waitForTimeout(500);
const alert = page.locator("[data-similarity-alert]");
await alert.waitFor({ state: "visible", timeout: 4000 });
const peerAttr = await alert.getAttribute("data-similarity-peer");
if (peerAttr !== "t-peer") {
  throw new Error(`expected peer t-peer, got ${peerAttr}`);
}
const focused = page.locator('tr[data-excel-row="t-peer"][data-similarity-focus="1"]');
await focused.waitFor({ state: "attached", timeout: 3000 });

await page.screenshot({
  path: `${OUT}/ilbiseo-similarity-focus-peer.png`,
  fullPage: true,
});
await page.locator("[data-similarity-alert-ok]").click();
await page.waitForTimeout(200);

// 할 일: only open 지침/습관
const guideTodo = page.locator('[data-side-kind="guideline"][data-side-mode="active"]');
await guideTodo.scrollIntoViewIfNeeded();
const guideTodoIds = await guideTodo.locator("[data-side-item]").evaluateAll((els) =>
  els.map((e) => e.getAttribute("data-side-item")),
);
if (!guideTodoIds.includes("g-open") || guideTodoIds.includes("g-done")) {
  throw new Error(`할 일 지침 should be open-only, got ${guideTodoIds}`);
}
const habitTodo = page.locator('[data-side-kind="habit"][data-side-mode="active"]');
const habitTodoIds = await habitTodo.locator("[data-side-item]").evaluateAll((els) =>
  els.map((e) => e.getAttribute("data-side-item")),
);
if (!habitTodoIds.includes("h-open") || habitTodoIds.includes("h-done")) {
  throw new Error(`할 일 습관 should be open-only, got ${habitTodoIds}`);
}

await page.screenshot({
  path: `${OUT}/ilbiseo-todo-side-active-only.png`,
  fullPage: true,
});

// Complete open guideline → disappears from 할 일
await page.locator('[data-side-select-cell="g-open"]').click();
await page.waitForTimeout(100);
await guideTodo.locator("[data-side-bulk-complete]").click();
await page.waitForTimeout(300);
if ((await guideTodo.locator('[data-side-item="g-open"]').count()) !== 0) {
  throw new Error("completed guideline must leave 할 일");
}

// 한 일: completed only + 수정 button
await page.getByRole("button", { name: "한 일" }).click();
await page.waitForTimeout(500);
const guideDone = page.locator('[data-side-kind="guideline"][data-side-mode="done"]');
await guideDone.scrollIntoViewIfNeeded();
const guideDoneIds = await guideDone.locator("[data-side-item]").evaluateAll((els) =>
  els.map((e) => e.getAttribute("data-side-item")),
);
if (!guideDoneIds.includes("g-done") || !guideDoneIds.includes("g-open")) {
  throw new Error(
    `한 일 지침 should include g-done + completed g-open, got ${guideDoneIds}`,
  );
}
const openOnDone = await guideDone.locator('[data-side-item-done="0"]').count();
if (openOnDone !== 0) {
  throw new Error("한 일 must not show incomplete 지침");
}
const editBtn = guideDone.locator('[data-side-edit="g-done"]');
if ((await editBtn.count()) !== 1) {
  throw new Error("완료 지침에 「수정」 버튼 필요");
}
if ((await guideDone.locator("[data-side-add]").count()) !== 0) {
  throw new Error("한 일 지침에 「항목 추가」 없어야 함");
}

await page.screenshot({
  path: `${OUT}/ilbiseo-done-side-completed.png`,
  fullPage: true,
});

const habitDone = page.locator('[data-side-kind="habit"][data-side-mode="done"]');
const habitDoneIds = await habitDone.locator("[data-side-item]").evaluateAll((els) =>
  els.map((e) => e.getAttribute("data-side-item")),
);
if (!habitDoneIds.includes("h-done") || habitDoneIds.includes("h-open")) {
  throw new Error(`한 일 습관 completed-only, got ${habitDoneIds}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      zoomLocked,
      viewportMeta,
      selfNoAlert: !selfAlertVisible,
      peerFocus: peerAttr,
      guideTodoIds,
      habitTodoIds,
      guideDoneIds,
      habitDoneIds,
      screenshots: [
        "ilbiseo-similarity-focus-peer.png",
        "ilbiseo-todo-side-active-only.png",
        "ilbiseo-done-side-completed.png",
      ],
    },
    null,
    2,
  ),
);

await browser.close();
