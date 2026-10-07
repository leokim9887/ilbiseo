import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

const state = {
  version: 3,
  tasks: [
    {
      id: "t1",
      title: "서류 제출",
      category: "work",
      kind: "spot",
      startDate: "2026-10-01",
      targetDate: "2026-10-05",
      urgency: 3,
      importance: 2,
      groupKey: "서류",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t2",
      title: "병원 예약",
      category: "personal",
      kind: "ongoing",
      startDate: "2026-10-03",
      targetDate: "2026-10-20",
      urgency: 1,
      importance: 3,
      groupKey: "병원",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-02T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "t3",
      title: "책 읽기",
      category: "personal",
      kind: "someday",
      startDate: null,
      targetDate: null,
      urgency: 2,
      importance: 1,
      groupKey: "책",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-03T00:00:00.000Z",
      completedAt: null,
    },
  ],
  checklists: [],
  calendarEvents: [],
  guidelines: [],
  habits: [],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate((s) => {
  localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
  localStorage.setItem("ilbiseo-state-v2", JSON.stringify(s));
}, state);
await page.goto(`${BASE}?view=todo`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// personal frame may filter — switch to show tasks; pick personal for t2/t3 or show all frames
// Default frame might be work — switch to personal then click 중요도
const frameSelect = page.locator('select[aria-label="틀"]');
if (await frameSelect.count()) {
  await frameSelect.selectOption("personal");
  await page.waitForTimeout(400);
}

await page.screenshot({ path: `${OUT}/ilbiseo-column-sort-default.png`, fullPage: true });

await page.getByRole("button", { name: /중요도 정렬/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/ilbiseo-column-sort-importance-asc.png`, fullPage: true });

await page.getByRole("button", { name: /중요도 정렬/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/ilbiseo-column-sort-importance-desc.png`, fullPage: true });

await page.getByRole("button", { name: /마감목표 정렬/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/ilbiseo-column-sort-deadline-asc.png`, fullPage: true });

const hasBasic = await page.getByRole("button", { name: "기본 정렬" }).count();
console.log(JSON.stringify({ hasBasicBtn: hasBasic > 0 }));
await browser.close();
