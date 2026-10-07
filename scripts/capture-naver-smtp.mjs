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
  const editable = await page.locator("#work-email").evaluate(
    (el) => !el.hasAttribute("readonly"),
  );
  if (editable) throw new Error("email field should be readonly");

  await page.screenshot({
    path: `${OUT}/ilbiseo-naver-smtp-settings.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "테스트 메일 보내기" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `${OUT}/ilbiseo-naver-smtp-test-no-pass.png`,
    fullPage: true,
  });

  const note = await page.locator("text=네이버 앱 비밀번호").first().count();
  if (note < 1) {
    // also accept delivery message area
    const body = await page.locator("body").innerText();
    if (!body.includes("NAVER_SMTP_PASSWORD") && !body.includes("앱 비밀번호")) {
      throw new Error("expected Korean missing-password message");
    }
  }

  await browser.close();
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
