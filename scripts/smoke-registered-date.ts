/**
 * 「등록일」— createdAt KST day in UI/Excel; import preserves column on new rows only.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { buildWorkbook, EXCEL_ALL_SHEET } from "../src/lib/excel";
import {
  buildPreviewRows,
  parseExcelFile,
  previewToTodoDelta,
  autoMapHeaders,
  type ParsedSheet,
} from "../src/lib/excel-import";
import {
  createdAtFromRegisteredDate,
  formatDisplayDate,
  registeredDateFromCreatedAt,
  todayIsoKst,
} from "../src/lib/date-range";
import type { Task } from "../src/lib/types";

const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exit(1);
  }
  console.log("ok", name, detail ?? "");
}

function baseTask(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: "2026-10-20",
    targetDate: "2026-10-20",
    urgency: 2,
    importance: 2,
    groupKey: "g",
    memo: "",
    source: "manual",
    status: "active",
    createdAt: "2026-10-17T03:00:00.000Z",
    completedAt: null,
    ...partial,
  };
}

async function main() {
  // Helpers: KST day from createdAt (UTC evening → next KST day)
  ok(
    "kst-from-createdAt",
    registeredDateFromCreatedAt("2026-10-17T15:30:00.000Z") === "2026-10-18",
    registeredDateFromCreatedAt("2026-10-17T15:30:00.000Z"),
  );
  ok(
    "display-yy",
    formatDisplayDate(registeredDateFromCreatedAt("2026-10-17T03:00:00.000Z")) ===
      "26-10-17",
  );
  ok(
    "fallback-today",
    registeredDateFromCreatedAt("") === todayIsoKst() ||
      registeredDateFromCreatedAt(null) === todayIsoKst(),
  );
  const seeded = createdAtFromRegisteredDate("2026-09-01");
  ok(
    "createdAt-from-등록일",
    registeredDateFromCreatedAt(seeded) === "2026-09-01",
    seeded,
  );

  const tasks: Task[] = [
    baseTask({
      id: "a",
      title: "등록일 테스트",
      createdAt: "2026-10-17T03:00:00.000Z",
    }),
    baseTask({
      id: "b",
      title: "끝난",
      status: "completed",
      completedAt: "2026-10-18T00:00:00.000Z",
      createdAt: "2026-10-10T03:00:00.000Z",
    }),
  ];

  const buf = await buildWorkbook({ tasks, calendarEvents: [] });
  const outPath = path.join(OUT, "ilbiseo-registered-date-sample.xlsx");
  fs.writeFileSync(outPath, Buffer.from(buf as ArrayBuffer));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const all = wb.getWorksheet(EXCEL_ALL_SHEET)!;
  const headers: string[] = [];
  all.getRow(1).eachCell((c) => headers.push(String(c.value)));
  ok(
    "전체-등록일-between",
    headers.indexOf("할 일") === 2 &&
      headers.indexOf("등록일") === 3 &&
      headers.indexOf("마감목표") === 4,
    headers,
  );

  const regCell = all.getRow(2).getCell(4);
  const regVal = regCell.value;
  ok(
    "등록일-excel-date",
    regVal instanceof Date &&
      (regVal as Date).toISOString().startsWith("2026-10-17"),
    { value: regVal, numFmt: regCell.numFmt },
  );

  // Import: column present → preserve on new; update does not change createdAt
  const file = new File([buf], "일비서.xlsx");
  const parsed = await parseExcelFile(file);
  const sheet = parsed.sheets.find((s) => s.name === "전체")!;
  const mapping = autoMapHeaders(sheet.headers, "todo");
  ok("auto-map-등록일", mapping["등록일"] === "registered", mapping);

  const preview = buildPreviewRows(sheet, mapping, "work", []);
  const neu = preview.find((r) => r.title.includes("등록일 테스트"));
  ok(
    "preview-registeredDate",
    neu?.registeredDate === "2026-10-17",
    neu?.registeredDate,
  );
  const delta = previewToTodoDelta(preview.filter((r) => r.delta === "new"));
  ok(
    "new-row-createdAt-from-등록일",
    delta.add.some(
      (t) =>
        t.title.includes("등록일 테스트") &&
        registeredDateFromCreatedAt(t.createdAt) === "2026-10-17",
    ),
    delta.add.map((t) => ({
      title: t.title,
      day: registeredDateFromCreatedAt(t.createdAt),
    })),
  );

  // Update path: changed row must not patch createdAt
  const existing: Task[] = [
    baseTask({
      id: "keep",
      title: "등록일 테스트",
      createdAt: "2026-01-01T03:00:00.000Z",
      importance: 1,
    }),
  ];
  const preview2 = buildPreviewRows(sheet, mapping, "work", existing);
  const changed = previewToTodoDelta(preview2);
  ok(
    "update-no-createdAt-patch",
    changed.update.length >= 1 &&
      changed.update.every((u) => !("createdAt" in u.patch)),
    changed.update,
  );

  // Legacy sheet without 등록일 → import day
  const legacy: ParsedSheet = {
    name: "업무용",
    headers: ["순서", "할 일", "마감목표", "중요도"],
    rows: [
      {
        순서: 1,
        "할 일": "옛양식 행",
        마감목표: "2026-10-20",
        중요도: 2,
      },
    ],
  };
  const legacyMap = autoMapHeaders(legacy.headers, "todo");
  ok("legacy-no-등록일-map", !Object.values(legacyMap).includes("registered"));
  const legacyPrev = buildPreviewRows(legacy, legacyMap, "work", []);
  ok(
    "legacy-registeredDate-null",
    legacyPrev[0]?.registeredDate == null,
    legacyPrev[0],
  );
  const before = Date.now();
  const legacyDelta = previewToTodoDelta(legacyPrev);
  const after = Date.now();
  const ca = new Date(legacyDelta.add[0]!.createdAt).getTime();
  ok(
    "legacy-uses-import-time",
    ca >= before - 2000 && ca <= after + 2000,
    legacyDelta.add[0]?.createdAt,
  );

  console.log("sample", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
