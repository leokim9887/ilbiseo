import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4317";
const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";

async function dismissWelcome(page) {
  const btn = page.getByRole("button", { name: "시작하기" });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

async function shot(page, name) {
  const path = `${OUT}/ilbiseo-gcal-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log("wrote", path);
}

async function main() {
  const browser = await chromium.launch();
  const desktop = await browser.newPage({
    viewport: { width: 1360, height: 900 },
  });
  await desktop.goto(BASE, { waitUntil: "networkidle" });
  await desktop.evaluate(() => localStorage.clear());
  await desktop.reload({ waitUntil: "networkidle" });
  await dismissWelcome(desktop);

  // calendar tab — connect UI / setup without secrets
  await desktop.getByRole("button", { name: /^캘린더/ }).first().click();
  await desktop.waitForTimeout(500);
  await desktop.getByText(/Google|ICS|mock|키가 없습니다/).first().waitFor();
  await shot(desktop, "connect-ui");

  // mock events list (separate from workbook)
  await desktop.getByRole("button", { name: "mock 샘플" }).first().click();
  await desktop.waitForTimeout(400);
  await desktop.getByLabel("캘린더 일정 목록").waitFor();
  await shot(desktop, "event-list");

  // prove workbook is separate: switch to todo
  await desktop.getByRole("button", { name: /^할 일/ }).first().click();
  await desktop.waitForTimeout(400);
  await desktop.getByText("일비서.xlsx").first().waitFor();
  await shot(desktop, "workbook-separate");

  // ICS paste path
  await desktop.getByRole("button", { name: /^캘린더/ }).first().click();
  await desktop.waitForTimeout(300);
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:ICS 테스트 미팅
DTSTART:20261006T100000
END:VEVENT
END:VCALENDAR`;
  await desktop.getByPlaceholder(/ICS/).fill(ics);
  await desktop.getByRole("button", { name: "ICS 반영" }).click();
  await desktop.waitForTimeout(400);
  await shot(desktop, "ics-import");

  // briefing calendar block
  await desktop.getByRole("button", { name: /브리핑/ }).first().click();
  await desktop.waitForTimeout(400);
  await desktop.getByText("【구글 캘린더】").waitFor();
  await shot(desktop, "briefing-block");

  await desktop.close();

  const mobileCtx = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: "networkidle" });
  await dismissWelcome(mobile);
  await mobile
    .getByRole("button", { name: /캘린더|일정/ })
    .first()
    .click();
  await mobile.waitForTimeout(500);
  await shot(mobile, "mobile");
  await mobileCtx.close();
  await browser.close();

  // API smoke
  const status = await fetch(`${BASE}/api/google/status`).then((r) => r.json());
  console.log("status", status);
  const auth = await fetch(`${BASE}/api/google/auth`, { redirect: "manual" });
  console.log("auth status", auth.status); // 503 without secrets is expected
  console.log("ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
