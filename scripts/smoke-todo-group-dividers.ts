/**
 * 「구분하기」— keyword extract, sheet separators, Excel 구분 round-trip.
 */
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { buildWorkbook } from "../src/lib/excel";
import {
  autoMapHeaders,
  buildPreviewRows,
  parseExcelFile,
  previewToReplaceTasks,
  previewToTodoDelta,
} from "../src/lib/excel-import";
import { sinkPastSheetRowsLast, type SheetRow } from "../src/lib/sheet-rows";
import { filterSheetRowsBySearch } from "../src/lib/schedule-search";
import {
  extractGroupKeyword,
  groupIdFromLabel,
  insertGroupSeparators,
  makeTodoGroup,
} from "../src/lib/todo-group";
import type { Task } from "../src/lib/types";
import { addDaysIso, todayIsoKst } from "../src/lib/date-range";

const OUT =
  process.env.OUT_DIR ||
  "/cursor/stores/bc-c183c9b6-6e26-42be-ac03-4fae1f3882f3/media";
fs.mkdirSync(OUT, { recursive: true });

const TODAY = todayIsoKst();

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: addDaysIso(TODAY, 3),
    targetDate: addDaysIso(TODAY, 3),
    urgency: 2,
    importance: 2,
    groupKey: "",
    groupId: null,
    groupLabel: null,
    memo: "",
    source: "manual",
    status: "active",
    createdAt: `${TODAY}T00:00:00.000Z`,
    completedAt: null,
    ...partial,
  };
}

// --- keyword extract ---
assert.equal(
  extractGroupKeyword(
    [
      task({ id: "1", title: "병원 예약하기" }),
      task({ id: "2", title: "병원 약 타기", memo: "진료 후" }),
    ],
  ),
  "병원",
  "common token 병원",
);
assert.equal(
  extractGroupKeyword(
    [task({ id: "1", title: "장보기" }), task({ id: "2", title: "운동" })],
    "세금 신고",
  ),
  "세금",
  "search query wins",
);
assert.equal(groupIdFromLabel("병원"), "grp:병원");
assert.equal(groupIdFromLabel("  병원  "), "grp:병원");

const made = makeTodoGroup([
  task({ id: "a", title: "팀 회의 준비" }),
  task({ id: "b", title: "팀 회의 자료" }),
]);
assert.equal(made.groupLabel, "회의");
assert.equal(made.groupId, "grp:회의");

// --- sheet separators ---
const g = makeTodoGroup([
  task({ id: "1", title: "병원 A" }),
  task({ id: "2", title: "병원 B" }),
]);
const rows: SheetRow[] = [
  {
    kind: "task",
    id: "x",
    task: task({ id: "x", title: "일반" }),
    sortKey: "a",
  },
  {
    kind: "task",
    id: "1",
    task: task({
      id: "1",
      title: "병원 A",
      groupId: g.groupId,
      groupLabel: g.groupLabel,
    }),
    sortKey: "b",
  },
  {
    kind: "task",
    id: "y",
    task: task({ id: "y", title: "중간" }),
    sortKey: "c",
  },
  {
    kind: "task",
    id: "2",
    task: task({
      id: "2",
      title: "병원 B",
      groupId: g.groupId,
      groupLabel: g.groupLabel,
    }),
    sortKey: "d",
  },
];
const clustered = insertGroupSeparators(rows);
const kinds = clustered.map((r) =>
  r.kind === "group-separator"
    ? `sep:${r.label}`
    : r.kind === "task"
      ? r.task.id
      : r.kind,
);
assert.deepEqual(
  kinds,
  ["x", "y", "sep:병원", "1", "2"],
  `ungrouped first, then group block ${JSON.stringify(kinds)}`,
);

// past + group
const pastRows: SheetRow[] = [
  {
    kind: "task",
    id: "1",
    task: task({
      id: "1",
      title: "병원 과거",
      groupId: g.groupId,
      groupLabel: g.groupLabel,
      startDate: addDaysIso(TODAY, -10),
      targetDate: addDaysIso(TODAY, -5),
    }),
    sortKey: "p",
  },
  {
    kind: "task",
    id: "2",
    task: task({
      id: "2",
      title: "병원 현재",
      groupId: g.groupId,
      groupLabel: g.groupLabel,
    }),
    sortKey: "c",
  },
  {
    kind: "task",
    id: "3",
    task: task({ id: "3", title: "다른 일" }),
    sortKey: "d",
  },
];
const sunk = sinkPastSheetRowsLast(pastRows, TODAY);
const withGroups = insertGroupSeparators(sunk);
assert.ok(
  withGroups.some((r) => r.kind === "past-separator"),
  "keeps past separator",
);
assert.equal(
  withGroups.filter((r) => r.kind === "group-separator").length,
  2,
  "group sep in current + past partitions",
);

const searched = filterSheetRowsBySearch(withGroups, "병원");
assert.ok(
  searched.every(
    (r) =>
      r.kind !== "task" ||
      r.task.title.includes("병원"),
  ),
);
assert.ok(
  searched.some((r) => r.kind === "group-separator"),
  "group sep survives search when members match",
);

// --- Excel round-trip ---
async function excelRoundTrip() {
  const tasks: Task[] = [
    task({
      id: "1",
      title: "병원 예약",
      groupId: "grp:병원",
      groupLabel: "병원",
      createdAt: `${addDaysIso(TODAY, -1)}T12:00:00.000Z`,
    }),
    task({
      id: "2",
      title: "병원 약",
      memo: "처방전",
      groupId: "grp:병원",
      groupLabel: "병원",
      createdAt: `${addDaysIso(TODAY, -2)}T12:00:00.000Z`,
    }),
    task({
      id: "3",
      title: "장보기",
      category: "personal",
      createdAt: `${addDaysIso(TODAY, -3)}T12:00:00.000Z`,
    }),
  ];
  const buf = await buildWorkbook({ tasks, calendarEvents: [] });
  const outPath = path.join(OUT, "ilbiseo-todo-group-dividers-sample.xlsx");
  fs.writeFileSync(outPath, Buffer.from(buf as ArrayBuffer));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const all = wb.getWorksheet("전체")!;
  const headers: string[] = [];
  all.getRow(1).eachCell((c) => headers.push(String(c.value)));
  assert.ok(headers.includes("구분"), `headers ${headers.join(",")}`);
  assert.ok(
    headers.indexOf("할 일") < headers.indexOf("구분") &&
      headers.indexOf("구분") < headers.indexOf("등록일"),
    headers.join("|"),
  );

  const groupCol = headers.indexOf("구분") + 1;
  const labels: string[] = [];
  all.eachRow((row, n) => {
    if (n === 1) return;
    labels.push(String(row.getCell(groupCol).value ?? ""));
  });
  assert.ok(labels.includes("병원"), labels);
  assert.ok(labels.includes(""), "ungrouped blank");

  const work = wb.getWorksheet("업무용")!;
  const workHeaders: string[] = [];
  work.getRow(1).eachCell((c) => workHeaders.push(String(c.value)));
  assert.ok(workHeaders.includes("구분"), workHeaders.join(","));

  const file = new File([buf], "일비서.xlsx");
  const parsed = await parseExcelFile(file);
  const sheet = parsed.sheets.find((s) => s.name === "전체")!;
  const mapping = autoMapHeaders(sheet.headers, "todo");
  assert.equal(mapping["구분"], "group", mapping);

  const preview = buildPreviewRows(sheet, mapping, "work", []);
  const hospital = preview.filter((r) => r.groupLabel === "병원");
  assert.equal(hospital.length, 2, hospital.map((r) => r.title));
  const replaced = previewToReplaceTasks(preview);
  assert.ok(
    replaced.filter((t) => t.groupId === "grp:병원").length === 2,
    replaced.map((t) => `${t.title}:${t.groupLabel}`),
  );

  const delta = previewToTodoDelta(
    buildPreviewRows(sheet, mapping, "work", [
      task({
        id: "exist",
        title: "병원 예약",
        groupId: null,
        groupLabel: null,
      }),
    ]),
  );
  const changed = delta.update.find((u) => u.id === "exist");
  assert.ok(changed, "matched existing");
  assert.equal(changed?.patch.groupLabel, "병원");
  assert.equal(changed?.patch.groupId, "grp:병원");

  console.log("ok smoke-todo-group-dividers", {
    outPath,
    headers,
    labels,
  });
}

excelRoundTrip().catch((e) => {
  console.error(e);
  process.exit(1);
});
