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
  });
  await page.goto(`${BASE}?view=briefing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  await page.getByText("아버지 메일 (고정)").waitFor();
  const val = await page.locator("#work-email").inputValue();
  if (val !== "goldage77@naver.com") {
    throw new Error(`locked email mismatch: ${val}`);
  }

  await page.screenshot({
    path: `${OUT}/ilbiseo-naver-test-ok-settings.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "테스트 메일 보내기" }).click();
  // Real Naver SMTP can take several seconds
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || "";
      return (
        t.includes("테스트 메일 · sent") ||
        t.includes("테스트 메일 · send_failed") ||
        t.includes("테스트 메일 · skipped_no_credentials") ||
        t.includes("네이버 SMTP로 메일을 보냈습니다")
      );
    },
    { timeout: 60000 },
  );
  await page.waitForTimeout(400);

  const body = await page.locator("body").innerText();
  const sent =
    body.includes("테스트 메일 · sent") ||
    body.includes("네이버 SMTP로 메일을 보냈습니다");
  const failed =
    body.includes("535") ||
    body.includes("send_failed") ||
    body.includes("Username and Password not accepted");

  const shot = sent
    ? `${OUT}/ilbiseo-naver-test-ok-sent.png`
    : failed
      ? `${OUT}/ilbiseo-naver-test-ok-smtp535.png`
      : `${OUT}/ilbiseo-naver-test-ok-result.png`;
  await page.screenshot({ path: shot, fullPage: true });

  console.log(
    JSON.stringify({
      sent: Boolean(sent),
      failed: Boolean(failed),
      has535: body.includes("535"),
      shot,
    }),
  );

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
