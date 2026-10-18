/**
 * Export current workbook and dump OOXML bits that often trigger Office repair.
 */
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { buildWorkbook } from "../src/lib/excel";
import { todayIsoKst } from "../src/lib/date-range";
import type { Task } from "../src/lib/types";

const OUT =
  process.env.OUT_DIR || "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const today = todayIsoKst();
  const tasks: Task[] = [
    {
      id: "1",
      title: "팀 회의",
      category: "work",
      kind: "spot",
      startDate: today,
      targetDate: today,
      urgency: 2,
      importance: 2,
      groupKey: "팀",
      memo: "안건",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "2",
      title: "언젠가 정리",
      category: "personal",
      kind: "someday",
      startDate: null,
      targetDate: null,
      urgency: 1,
      importance: 1,
      groupKey: "언젠가",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-02T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "3",
      title: "지난 일",
      category: "work",
      kind: "spot",
      startDate: "2026-10-01",
      targetDate: "2026-10-01",
      urgency: 2,
      importance: 3,
      groupKey: "지난",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-09-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "4",
      title: "끝난 일",
      category: "work",
      kind: "spot",
      startDate: today,
      targetDate: today,
      urgency: 1,
      importance: 1,
      groupKey: "끝",
      memo: "",
      source: "manual",
      status: "completed",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: "2026-10-17T00:00:00.000Z",
    },
  ];

  const buf = await buildWorkbook({
    tasks,
    calendarEvents: [],
    guidelines: [
      {
        id: "g1",
        title: "지침1",
        memo: "",
        done: false,
        createdAt: "2026-10-01T00:00:00.000Z",
        completedAt: null,
      },
    ],
    habits: [
      {
        id: "h1",
        title: "습관1",
        memo: "",
        done: false,
        createdAt: "2026-10-01T00:00:00.000Z",
        completedAt: null,
      },
    ],
  });
  const outPath = path.join(OUT, "ilbiseo-excel-repair-repro.xlsx");
  fs.writeFileSync(outPath, Buffer.from(buf as ArrayBuffer));
  console.log("wrote", outPath, (buf as ArrayBuffer).byteLength);

  const zip = await JSZip.loadAsync(buf as ArrayBuffer);
  const names = Object.keys(zip.files).sort();
  console.log("ENTRIES\n" + names.join("\n"));

  const findings: { file: string; flags: string[]; snippet?: string }[] = [];

  for (const name of names) {
    if (zip.files[name].dir) continue;
    if (!/\.(xml|rels|vml)$/i.test(name)) continue;
    const xml = await zip.file(name)!.async("string");
    const flags: string[] = [];
    if (/totalsRowShown="1"/.test(xml)) flags.push("BAD:totalsRowShown=1");
    if (/totalsRowShown="0"/.test(xml)) flags.push("totalsRowShown=0");
    if (/<dataValidations[\s>]/.test(xml)) flags.push("dataValidations");
    if (/<comments[\s>]/.test(xml) || /comments\d*\.xml/.test(name))
      flags.push("comments");
    if (/v:shape|urn:schemas-microsoft-com:vml/i.test(xml)) flags.push("vml");
    if (/legacyDrawing/.test(xml)) flags.push("legacyDrawing");
    if (/autoFilter/.test(xml) && name.includes("sheet")) flags.push("autoFilter");
    if (name.includes("table") || flags.length > 0) {
      let snippet: string | undefined;
      if (name.includes("table")) snippet = xml;
      else if (flags.includes("dataValidations")) {
        snippet = xml.match(/<dataValidations[\s\S]*?<\/dataValidations>/)?.[0];
      } else if (flags.includes("comments") || name.includes("comment")) {
        snippet = xml.slice(0, 2000);
      }
      findings.push({ file: name, flags, snippet });
    }
  }

  for (const f of findings) {
    console.log("\n===", f.file, f.flags.join(",") || "-");
    if (f.snippet) console.log(f.snippet.slice(0, 2200));
  }

  // Content types
  const ct = await zip.file("[Content_Types].xml")!.async("string");
  console.log("\n=== Content_Types (comment/drawing parts)");
  for (const line of ct.split(/>/)) {
    if (/comment|drawing|vml|table/i.test(line)) console.log(line.trim() + ">");
  }

  fs.writeFileSync(
    path.join(OUT, "smoke-excel-repair-inspect.json"),
    JSON.stringify(
      {
        outPath,
        entries: names,
        findings: findings.map((f) => ({
          file: f.file,
          flags: f.flags,
          snippetPreview: f.snippet?.slice(0, 500),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
