import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("ilbiseo-welcome-seen-v2", "1");
    localStorage.setItem(
      "ilbiseo-state-v2",
      JSON.stringify({
        version: 3,
        tasks: [
          {
            id: "t1",
            title: "후보 이력서 검토",
            category: "work",
            kind: "spot",
            startDate: "2026-10-07",
            targetDate: "2026-10-07",
            urgency: 3,
            importance: 3,
            groupKey: "채용",
            memo: "",
            source: "manual",
            status: "active",
            createdAt: new Date().toISOString(),
            completedAt: null,
          },
        ],
        checklists: [],
        calendarEvents: [],
        guidelines: [
          {
            id: "g1",
            title: "하루 브리핑 확인",
            memo: "",
            done: false,
            createdAt: new Date().toISOString(),
            completedAt: null,
          },
        ],
        habits: [],
      }),
    );
    localStorage.setItem(
      "ilbiseo-settings-v1",
      JSON.stringify({
        briefingHour: "08:00",
        workEmail: "",
        dailyEmailEnabled: false,
        attachXlsx: true,
      }),
    );
  });
  await page.goto(`${BASE}?view=briefing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  await page.getByText("아버지 업무용 이메일").waitFor();
  await page.screenshot({
    path: `${OUT}/ilbiseo-email-briefing-settings.png`,
    fullPage: true,
  });

  await page.getByPlaceholder(/father@|비워/).fill("father@example.com");
  await page.getByText("매일 08:00(KST) 자동 발송").click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT}/ilbiseo-email-briefing-enabled.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "테스트 메일 보내기" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `${OUT}/ilbiseo-email-briefing-test.png`,
    fullPage: true,
  });

  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
