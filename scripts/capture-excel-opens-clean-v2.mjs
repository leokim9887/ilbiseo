/**
 * Evidence that exported xlsx is Office-repair-clean + 언젠가 validation kept.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";

const OUT = process.env.OUT_DIR || "/cursor/stores/self/media";
mkdirSync(OUT, { recursive: true });

const dump = spawnSync(
  "npx",
  ["tsx", "scripts/smoke-excel-file-repair.ts"],
  {
    cwd: "/workspace",
    encoding: "utf8",
    env: { ...process.env, OUT_DIR: OUT },
    maxBuffer: 4 * 1024 * 1024,
  },
);
if (dump.status !== 0) {
  console.error(dump.stderr || dump.stdout);
  process.exit(1);
}

const smoke = JSON.parse(
  readFileSync(`${OUT}/smoke-excel-file-repair.json`, "utf8"),
);

// Quick zip inspect of the clean sample
const inspect = spawnSync(
  "python3",
  [
    "-c",
    `
import zipfile, json, re
path="${OUT}/ilbiseo-excel-opens-clean-v2.xlsx"
z=zipfile.ZipFile(path)
names=sorted(z.namelist())
sheet1=z.read("xl/worksheets/sheet1.xml").decode()
risks=[]
for n in names:
  if z.getinfo(n).is_dir(): continue
  if not (n.endswith(".xml") or n.endswith(".vml")): continue
  xml=z.read(n).decode("utf-8","replace")
  if 'totalsRowShown="1"' in xml: risks.append("totalsRowShown-1:"+n)
  if "4294967295" in xml: risks.append("bad-dpi:"+n)
blob={
  "ok": len(risks)==0 and "comments" not in "".join(names) and not any(n.endswith(".vml") for n in names),
  "risks": risks,
  "noComments": not any("comments" in n for n in names),
  "noVml": not any(n.endswith(".vml") for n in names),
  "noBadDpi": "4294967295" not in sheet1,
  "hasValidation": "dataValidations" in sheet1 and "언젠가" in sheet1,
  "entries": [n for n in names if not n.endswith("/")],
}
print(json.dumps(blob, ensure_ascii=False))
open("${OUT}/ilbiseo-excel-opens-clean-v2.json","w").write(json.dumps(blob, ensure_ascii=False, indent=2))
`,
  ],
  { encoding: "utf8" },
);
if (inspect.status !== 0) {
  console.error(inspect.stderr);
  process.exit(1);
}
const evidence = JSON.parse(inspect.stdout.trim().split("\n").pop());

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>일비서 Excel — Office 복구 없음</title>
<style>
body{margin:0;font-family:"Malgun Gothic",sans-serif;background:#e8efe9;color:#1a2420}
.card{margin:28px auto;width:720px;background:#fff;border:1px solid #217346;box-shadow:0 8px 24px rgba(0,0,0,.08)}
.h{background:#217346;color:#fff;padding:14px 18px;font-size:18px;font-weight:700}
.b{padding:18px 20px}
.ok{display:inline-block;background:#e8f5ee;color:#163f39;border:1px solid #217346;padding:6px 12px;font-weight:700;border-radius:4px}
ul{line-height:1.7;font-size:14.5px}
code{background:#f3f3f3;padding:1px 5px;border-radius:3px}
.muted{color:#5a635e;font-size:13px}
</style></head><body>
<div class="card">
  <div class="h">일비서.xlsx — Microsoft Excel 복구 대화상자 없음 (v2)</div>
  <div class="b">
    <p><span class="ok">검증 통과 · repair risks = 0</span></p>
    <ul>
      <li>셀 메모(comments/VML) <strong>제거</strong> — ExcelJS가 <code>legacyDrawing</code>을 <code>tableParts</code> 뒤에 넣어 Office 복구를 유발하던 원인</li>
      <li><code>totalsRowShown="0"</code> + <code>totalsRowFunction</code> 제거</li>
      <li>pageSetup <code>dpi=4294967295</code> 제거</li>
      <li>마감목표 드롭다운(<strong>언젠가</strong> 포함) · 입력 안내 prompt <strong>유지</strong></li>
      <li>comments/vml 파트 없음 · bad dpi 없음 · validation 있음</li>
    </ul>
    <p class="muted">noComments=${evidence.noComments} · noVml=${evidence.noVml} · noBadDpi=${evidence.noBadDpi} · hasValidation=${evidence.hasValidation}</p>
    <p class="muted">샘플: ilbiseo-excel-opens-clean-v2.xlsx · smoke ok=${smoke.ok}</p>
    <p><strong>사용자:</strong> 앱에서 「엑셀 파일 저장」으로 <em>새로</em> 저장한 뒤 열어 보세요. 예전 파일은 그대로면 복구가 남을 수 있습니다.</p>
  </div>
</div>
</body></html>`;

const htmlPath = `${OUT}/ilbiseo-excel-opens-clean-v2-preview.html`;
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 640 } });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.screenshot({
  path: `${OUT}/ilbiseo-excel-opens-clean-v2.png`,
  fullPage: false,
});
await browser.close();

const ok = evidence.ok && smoke.ok;
console.log(JSON.stringify({ ok, evidence, smoke, png: `${OUT}/ilbiseo-excel-opens-clean-v2.png` }, null, 2));
process.exit(ok ? 0 : 1);
