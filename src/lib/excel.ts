import ExcelJS from "exceljs";
import {
  CATEGORY_LABEL,
  type CalendarEvent,
  type SideListItem,
  type Task,
} from "./types";
import { sortCompleted, sortTasks } from "./sort";
import type { DailyBriefing } from "./briefing";
import {
  filterCalendarEventsInWindow,
  formatCalendarWhen,
} from "./calendar-data";
import {
  addDaysIso,
  deadlineExcelParts,
  todayIsoKst,
} from "./date-range";
import {
  repairExcelJsTableXml,
  sanitizeExcelText,
} from "./excel-xlsx-repair";

/** Father-facing 마감목표 entry formats (Excel dropdown + comment). */
export const DEADLINE_ENTRY_HELP =
  "마감목표 입력 안내\n" +
  "· 언젠가 — 기한 없음 (앱「언젠가」와 동일)\n" +
  "· 2026-10-17 — 하루\n" +
  "· 2026-10-17 ~ 2026-10-24 — 구간\n" +
  "목록에서 고르거나 위 형식으로 직접 입력하세요. 불러오면 앱과 똑같이 맞춰집니다.";

/** Dropdown list formula for Excel data validation (comma-separated). */
export function deadlineValidationListFormula(
  today: string = todayIsoKst(),
): string {
  const tomorrow = addDaysIso(today, 1);
  const weekEnd = addDaysIso(today, 6);
  const twoWeekEnd = addDaysIso(today, 13);
  const items = [
    "언젠가",
    today,
    tomorrow,
    `${today} ~ ${weekEnd}`,
    `${today} ~ ${twoWeekEnd}`,
  ];
  return `"${items.join(",")}"`;
}

function applyDeadlineEntryAids(
  sheet: ExcelJS.Worksheet,
  dataRowCount: number,
) {
  const today = todayIsoKst();
  const endRow = Math.max(dataRowCount + 40, 50);
  const validation: ExcelJS.DataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [deadlineValidationListFormula(today)],
    // Soft: father may type any date/range not in the short list
    showErrorMessage: false,
    showInputMessage: true,
    promptTitle: "마감목표",
    prompt:
      "「언젠가」· YYYY-MM-DD · YYYY-MM-DD ~ YYYY-MM-DD — 목록에서 고르거나 직접 입력",
  };
  // ExcelJS runtime has dataValidations; typings omit it on Worksheet
  (
    sheet as ExcelJS.Worksheet & {
      dataValidations: { add: (address: string, v: ExcelJS.DataValidation) => void };
    }
  ).dataValidations.add(`D2:D${endRow}`, validation);
  sheet.getCell(1, 4).note = {
    texts: [
      {
        font: { size: 11, name: "Malgun Gothic", family: 2 },
        text: DEADLINE_ENTRY_HELP,
      },
    ],
  };
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F3F3" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: "FF000000" },
  bold: true,
  size: 12,
};
const THIN_BLACK: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = THIN_BLACK;
  });
  row.height = 24;
}

/**
 * 「할 일」·「한 일」동일 열 — no 완료여부.
 * ▾ only on 틀 · 마감목표 · 중요도.
 */
const TODO_TABLE_COLUMNS: ExcelJS.TableColumnProperties[] = [
  { name: "순서", filterButton: false },
  { name: "틀", filterButton: true },
  { name: "할 일", filterButton: false },
  { name: "마감목표", filterButton: true },
  { name: "중요도", filterButton: true },
];

function listUpCell(task: Pick<Task, "title" | "memo">): string {
  const title = sanitizeExcelText(String(task.title ?? ""));
  const memo = sanitizeExcelText(String(task.memo ?? ""));
  return memo ? `${title}\n${memo}` : title;
}

/** 마감목표: single day = Date; range/언젠가 = text (exact round-trip). */
function writeDeadlineCell(
  cell: ExcelJS.Cell,
  task: Pick<Task, "startDate" | "targetDate" | "kind">,
) {
  const parts = deadlineExcelParts(task);
  if (parts.kind === "date") {
    if (Number.isNaN(parts.value.getTime())) {
      cell.value = parts.start;
      return;
    }
    cell.value = parts.value;
    cell.numFmt = parts.numFmt;
    return;
  }
  cell.value = parts.value;
}

function deadlineCellValue(
  task: Pick<Task, "startDate" | "targetDate" | "kind">,
): Date | string {
  const parts = deadlineExcelParts(task);
  if (parts.kind === "date") {
    if (Number.isNaN(parts.value.getTime())) return parts.start;
    return parts.value;
  }
  return parts.value;
}

function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function applyTodoColumnLayout(
  sheet: ExcelJS.Worksheet,
  columnCount: number,
) {
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 10;
  sheet.getColumn(3).width = 48;
  sheet.getColumn(4).width = 22;
  sheet.getColumn(5).width = 10;
  if (columnCount >= 6) sheet.getColumn(6).width = 10;
  sheet.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn(4).alignment = {
    wrapText: true,
    vertical: "middle",
    horizontal: "center",
  };
  sheet.getColumn(2).alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  sheet.getColumn(5).alignment = {
    vertical: "middle",
    horizontal: "center",
  };
}

/**
 * Sortable todo sheet.
 * - With rows: Excel Table (filter ▾ on 틀·마감·중요도). XML repaired after write
 *   (ExcelJS totalsRowShown bug).
 * - Empty: header row only — **no Table** (header-only tables trigger Office repair).
 */
function enableSortableTodoTable(
  sheet: ExcelJS.Worksheet,
  tableName: string,
  dataRows: ExcelJS.CellValue[][],
  tasksForDeadlineFmt: Pick<Task, "startDate" | "targetDate" | "kind">[],
  columns: ExcelJS.TableColumnProperties[],
) {
  sheet.autoFilter = undefined;

  if (dataRows.length === 0) {
    // Header-only — skip Table XML entirely (Office often repairs A1:E1 tables)
    sheet.addRow(columns.map((c) => c.name));
    styleHeader(sheet.getRow(1));
    applyTodoColumnLayout(sheet, columns.length);
    applyDeadlineEntryAids(sheet, 0);
    return;
  }

  sheet.addTable({
    name: tableName,
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium1",
      showRowStripes: false,
      showColumnStripes: false,
    },
    columns,
    rows: dataRows,
  });
  styleHeader(sheet.getRow(1));
  applyTodoColumnLayout(sheet, columns.length);
  tasksForDeadlineFmt.forEach((t, i) => {
    writeDeadlineCell(sheet.getRow(i + 2).getCell(4), t);
  });
  applyDeadlineEntryAids(sheet, dataRows.length);
  // Ensure dimension covers table (defensive)
  const lastCol = colLetter(columns.length);
  const lastRow = 1 + dataRows.length;
  void lastCol;
  void lastRow;
}

export type WorkbookPayload = {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  briefing?: DailyBriefing | null;
  guidelines?: SideListItem[];
  habits?: SideListItem[];
};

function addSideSheet(
  wb: ExcelJS.Workbook,
  name: string,
  items: SideListItem[],
) {
  const sheet = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  // Unified model — no 완료 column (same on 할 일 / 한 일 views)
  sheet.columns = [
    { header: "순서", key: "order", width: 8 },
    { header: "내용", key: "title", width: 40 },
    { header: "메모", key: "memo", width: 28 },
  ];
  styleHeader(sheet.getRow(1));
  items.forEach((item, i) => {
    sheet.addRow({
      order: i + 1,
      title: sanitizeExcelText(item.title ?? ""),
      memo: sanitizeExcelText(item.memo ?? ""),
    });
  });
}

export async function buildWorkbook(
  payload: WorkbookPayload,
): Promise<ArrayBuffer> {
  const {
    tasks,
    calendarEvents,
    briefing,
    guidelines = [],
    habits = [],
  } = payload;
  const wb = new ExcelJS.Workbook();
  wb.creator = "일비서";
  wb.created = new Date();

  // Father TO DO LIST: Excel Table — ▾ only on 틀 · 마감목표 · 중요도
  // (시급성 열은 제거 — 기존 파일 불러오기는 excel-import에서 선택 매핑)
  const todo = wb.addWorksheet("할 일", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const activeTasks = sortTasks(tasks);
  const todoRows: ExcelJS.CellValue[][] = activeTasks.map((t, i) => [
    i + 1,
    CATEGORY_LABEL[t.category],
    listUpCell(t),
    deadlineCellValue(t),
    Number(t.importance) || 0,
  ]);
  enableSortableTodoTable(
    todo,
    "IlbiseoTodo",
    todoRows,
    activeTasks,
    TODO_TABLE_COLUMNS,
  );

  const done = wb.addWorksheet("한 일", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const completedTasks = sortCompleted(tasks);
  // Same columns as 「할 일」— no 완료여부 (sheet membership already means done)
  const doneRows: ExcelJS.CellValue[][] = completedTasks.map((t, i) => [
    i + 1,
    CATEGORY_LABEL[t.category],
    listUpCell(t),
    deadlineCellValue(t),
    Number(t.importance) || 0,
  ]);
  enableSortableTodoTable(
    done,
    "IlbiseoDone",
    doneRows,
    completedTasks,
    TODO_TABLE_COLUMNS,
  );

  // 「구글캘린더」: only events within 2 weeks from save (KST), one row per event
  // (multi-day → full range in 「언제」). No 「캘린더」/「출처」 columns.
  const cal = wb.addWorksheet("구글캘린더", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  cal.columns = [
    { header: "언제", key: "when", width: 28 },
    { header: "일정", key: "title", width: 34 },
    { header: "메모", key: "notes", width: 28 },
  ];
  styleHeader(cal.getRow(1));
  const saveDay = todayIsoKst();
  const windowEnd = addDaysIso(saveDay, 14);
  const calInWindow = filterCalendarEventsInWindow(
    calendarEvents,
    saveDay,
    windowEnd,
  );
  for (const e of [...calInWindow].sort((a, b) =>
    a.start.localeCompare(b.start),
  )) {
    cal.addRow({
      when: sanitizeExcelText(formatCalendarWhen(e)),
      title: sanitizeExcelText(e.title ?? ""),
      notes: sanitizeExcelText(e.notes ?? ""),
    });
  }
  cal.getColumn("when").alignment = {
    wrapText: true,
    vertical: "middle",
  };

  addSideSheet(wb, "지침", guidelines);
  addSideSheet(wb, "습관", habits);

  if (briefing) {
    const summary = wb.addWorksheet("브리핑요약");
    summary.getColumn(1).width = 88;
    summary.addRow([sanitizeExcelText(briefing.headline)]);
    summary.getRow(1).font = {
      bold: true,
      size: 14,
      color: { argb: "FF163F39" },
    };
    summary.addRow([sanitizeExcelText(briefing.summaryLine)]);
    summary.addRow([]);
    for (const line of briefing.plaintext.split("\n")) {
      summary.addRow([sanitizeExcelText(line)]);
    }
  }

  const raw = await wb.xlsx.writeBuffer();
  // ExcelJS Table bug → Office「이 파일에 오류가 생겼습니다」repair dialog
  return repairExcelJsTableXml(raw);
}

/** @deprecated alias */
export async function buildBriefingWorkbook(
  tasks: Task[],
  briefing: DailyBriefing,
  calendarEvents: CalendarEvent[] = [],
) {
  return buildWorkbook({ tasks, calendarEvents, briefing });
}

export function briefingFilename(date: string): string {
  return `일비서-${date}.xlsx`;
}

export function downloadXlsx(
  buffer: ArrayBuffer | ExcelJS.Buffer,
  filename: string,
) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
