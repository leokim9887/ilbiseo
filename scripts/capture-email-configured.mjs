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
        tasks: [],
        checklists: [],
        calendarEvents: [],
        guidelines: [],
        habits: [],
      }),
    );
    // empty settings → app should persist default email
  });
  await page.goto(`${BASE}?view=briefing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const email = page.locator("#work-email");
  await email.waitFor();
  const val = await email.inputValue();
  if (val !== "goldage77@naver.com") {
    throw new Error(`expected default email, got: ${val}`);
  }

  await page.screenshot({
    path: `${OUT}/ilbiseo-email-configured-default.png`,
    fullPage: true,
  });

  await page.getByText("매일 08:00(KST) 자동 발송").click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${OUT}/ilbiseo-email-configured-enabled.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "테스트 메일 보내기" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: `${OUT}/ilbiseo-email-configured-test-result.png`,
    fullPage: true,
  });

  await browser.close();
  console.log("ok", val);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
