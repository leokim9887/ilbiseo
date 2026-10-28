import ExcelJS from "exceljs";
import {
  CATEGORY_LABEL,
  type CalendarEvent,
  type SideListItem,
  type Task,
} from "./types";
import { listActiveForExport, sortCompleted } from "./sort";
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

/** Father-facing 마감목표 entry formats (Excel dropdown + input prompt). */
export const DEADLINE_ENTRY_HELP =
  "마감목표 입력 안내\n" +
  "· 언젠가 — 기한 없음 (앱「언젠가」와 동일)\n" +
  "· 2026-10-17 — 하루\n" +
  "· 2026-10-17 ~ 2026-10-24 — 구간\n" +
  "· ~10/30 — 그날까지: 시작=오늘, 종료=10/30 (이미 지난 ~10/18 은 하루 10/18만)\n" +
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

/**
 * Excel-native 마감목표 entry help — list dropdown only.
 * Do NOT attach cell comments/notes: ExcelJS emits legacyDrawing after
 * tableParts (invalid OOXML order) → Office「내용에 문제가 있습니다」repair.
 */
function applyDeadlineEntryAids(
  sheet: ExcelJS.Worksheet,
  dataRowCount: number,
) {
  const today = todayIsoKst();
  // Bound validation to a modest pad past data (not far past table end)
  const endRow = Math.max(dataRowCount + 20, 2);
  const validation: ExcelJS.DataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [deadlineValidationListFormula(today)],
    // Soft: father may type any date/range not in the short list
    showErrorMessage: false,
    showInputMessage: true,
    promptTitle: "마감목표",
    // ASCII-safe punctuation — Office list prompts are fragile with fancy quotes
    prompt:
      "언젠가 / YYYY-MM-DD / YYYY-MM-DD ~ YYYY-MM-DD — 목록에서 고르거나 직접 입력",
  };
  // ExcelJS runtime has dataValidations; typings omit it on Worksheet
  (
    sheet as ExcelJS.Worksheet & {
      dataValidations: { add: (address: string, v: ExcelJS.DataValidation) => void };
    }
  ).dataValidations.add(`D2:D${endRow}`, validation);
  // Intentionally no sheet.getCell(...).note — see comment above.
}

/** Soft sage header — readable on Excel desktop & Online; brand-adjacent ink. */
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE2EDE8" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: "Malgun Gothic",
  color: { argb: "FF163F39" },
  bold: true,
  size: 11,
};
const BODY_FONT: Partial<ExcelJS.Font> = {
  name: "Malgun Gothic",
  color: { argb: "FF1A2420" },
  size: 11,
};
/** Light grid — cleaner than harsh black; still visible in Excel Online. */
const GRID_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB8C4BE" } },
  left: { style: "thin", color: { argb: "FFB8C4BE" } },
  bottom: { style: "thin", color: { argb: "FFB8C4BE" } },
  right: { style: "thin", color: { argb: "FFB8C4BE" } },
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = GRID_BORDER;
  });
  row.height = 26;
}

/** Body cells: light border + Korean-friendly font; keep existing numFmt/value. */
function styleBodyCells(
  sheet: ExcelJS.Worksheet,
  dataRowCount: number,
  columnCount: number,
  opts?: {
    titleCol?: number;
    titleColWidth?: number;
    memoLines?: boolean[];
  },
) {
  const titleCol = opts?.titleCol ?? 0;
  const titleWidth = opts?.titleColWidth ?? 42;
  for (let r = 2; r <= dataRowCount + 1; r++) {
    const row = sheet.getRow(r);
    const idx = r - 2;
    const titleText =
      titleCol > 0 ? cellPlainText(row.getCell(titleCol).value) : "";
    const multi =
      opts?.memoLines?.[idx] === true || titleText.includes("\n");
    if (titleCol > 0 && titleText) {
      row.height = wrappedRowHeight(titleText, titleWidth);
    } else {
      row.height = multi ? 34 : 20;
    }
    for (let c = 1; c <= columnCount; c++) {
      const cell = row.getCell(c);
      cell.border = GRID_BORDER;
      // Do not flatten rich-text memo styling on 「할 일」cells
      const isRich =
        cell.value != null &&
        typeof cell.value === "object" &&
        "richText" in cell.value;
      if (!isRich) cell.font = BODY_FONT;
    }
  }
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

const MEMO_FONT: Partial<ExcelJS.Font> = {
  name: "Malgun Gothic",
  color: { argb: "FF5A635E" },
  size: 10,
  italic: true,
};

/**
 * 「할 일」셀: title + memo on next line (import splitListUp: first line / rest).
 * Memo is muted italic so it stays visually distinct — not merged into title styling.
 */
function listUpCell(
  task: Pick<Task, "title" | "memo">,
): string | ExcelJS.CellRichTextValue {
  const title = sanitizeExcelText(String(task.title ?? ""));
  const memo = sanitizeExcelText(String(task.memo ?? ""));
  if (!memo) return title;
  return {
    richText: [
      { text: title, font: { ...BODY_FONT } },
      { text: `\n${memo}`, font: { ...MEMO_FONT } },
    ],
  };
}

function cellPlainText(value: ExcelJS.CellValue | undefined): string {
  if (value == null) return "";
  if (typeof value === "object" && "richText" in value) {
    return (value.richText ?? []).map((r) => r.text).join("");
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** Rough row height for wrapped Korean text at a given Excel column width. */
function wrappedRowHeight(text: string, colWidth: number): number {
  const charsPerLine = Math.max(6, Math.floor(colWidth * 0.9));
  let lines = 0;
  for (const part of text.split("\n")) {
    const len = [...part].length;
    lines += Math.max(1, Math.ceil(len / charsPerLine));
  }
  return Math.min(140, Math.max(20, 4 + lines * 15));
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

/** Exact Excel width units (father layout). */
const TODO_COL_WIDTHS = {
  order: 6,
  frame: 10,
  title: 95,
  deadline: 28,
  importance: 8,
} as const;

function applyTodoColumnLayout(
  sheet: ExcelJS.Worksheet,
  columnCount: number,
) {
  sheet.getColumn(1).width = TODO_COL_WIDTHS.order;
  sheet.getColumn(2).width = TODO_COL_WIDTHS.frame;
  sheet.getColumn(3).width = TODO_COL_WIDTHS.title;
  sheet.getColumn(4).width = TODO_COL_WIDTHS.deadline;
  sheet.getColumn(5).width = TODO_COL_WIDTHS.importance;
  if (columnCount >= 6) sheet.getColumn(6).width = 8;
  sheet.getColumn(1).alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  sheet.getColumn(2).alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  sheet.getColumn(3).alignment = {
    wrapText: true,
    vertical: "top",
    horizontal: "left",
  };
  sheet.getColumn(4).alignment = {
    wrapText: true,
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
  // Re-apply rich-text 「할 일」cells (table write may flatten) then style borders
  dataRows.forEach((rowVals, i) => {
    const v = rowVals[2];
    if (v != null && typeof v === "object" && "richText" in (v as object)) {
      sheet.getRow(i + 2).getCell(3).value = v as ExcelJS.CellRichTextValue;
    }
  });
  styleBodyCells(sheet, dataRows.length, columns.length, {
    titleCol: 3,
    titleColWidth: TODO_COL_WIDTHS.title,
    memoLines: dataRows.map((row) => cellPlainText(row[2]).includes("\n")),
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
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
  });
  // Unified model — no 완료 column (same on 할 일 / 한 일 views)
  // Exact widths: 내용 70 · 메모 30
  sheet.columns = [
    { header: "순서", key: "order", width: 6 },
    { header: "내용", key: "title", width: 70 },
    { header: "메모", key: "memo", width: 30 },
  ];
  styleHeader(sheet.getRow(1));
  items.forEach((item, i) => {
    sheet.addRow({
      order: i + 1,
      title: sanitizeExcelText(item.title ?? ""),
      memo: sanitizeExcelText(item.memo ?? ""),
    });
  });
  sheet.getColumn(1).alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  sheet.getColumn(2).alignment = {
    wrapText: true,
    vertical: "top",
    horizontal: "left",
  };
  sheet.getColumn(3).alignment = {
    wrapText: true,
    vertical: "top",
    horizontal: "left",
  };
  styleBodyCells(sheet, items.length, 3, {
    titleCol: 2,
    titleColWidth: 70,
    memoLines: items.map((item) =>
      Boolean(sanitizeExcelText(item.memo ?? "")),
    ),
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
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
  });
  // Match UI: stored newest-first order + 「지난 일정」 sink to end.
  const activeTasks = listActiveForExport(tasks);
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
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
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

  // 「구글캘린더」: display-only (not in IMPORT_SHEET_ALLOWLIST).
  // No 「메모」column — import never reads this sheet; notes were display-only.
  const cal = wb.addWorksheet("구글캘린더", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: true }],
  });
  cal.columns = [
    { header: "언제", key: "when", width: 20 },
    { header: "일정", key: "title", width: 70 },
  ];
  styleHeader(cal.getRow(1));
  const saveDay = todayIsoKst();
  const windowEnd = addDaysIso(saveDay, 14);
  const calInWindow = filterCalendarEventsInWindow(
    calendarEvents,
    saveDay,
    windowEnd,
  );
  const calSorted = [...calInWindow].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  for (const e of calSorted) {
    cal.addRow({
      when: sanitizeExcelText(formatCalendarWhen(e)),
      title: sanitizeExcelText(e.title ?? ""),
    });
  }
  cal.getColumn(1).alignment = {
    wrapText: true,
    vertical: "middle",
    horizontal: "left",
  };
  cal.getColumn(2).alignment = {
    wrapText: true,
    vertical: "top",
    horizontal: "left",
  };
  styleBodyCells(cal, calSorted.length, 2, {
    titleCol: 2,
    titleColWidth: 70,
  });

  addSideSheet(wb, "지침", guidelines);
  addSideSheet(wb, "습관", habits);

  if (briefing) {
    const summary = wb.addWorksheet("브리핑요약", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    });
    // Exact Excel width unit
    summary.getColumn(1).width = 85;
    summary.addRow([sanitizeExcelText(briefing.headline)]);
    const head = summary.getRow(1);
    head.font = {
      name: "Malgun Gothic",
      bold: true,
      size: 14,
      color: { argb: "FF163F39" },
    };
    head.alignment = { wrapText: true, vertical: "middle" };
    head.height = wrappedRowHeight(
      sanitizeExcelText(briefing.headline),
      85,
    );
    head.getCell(1).fill = HEADER_FILL;
    head.getCell(1).border = GRID_BORDER;

    summary.addRow([sanitizeExcelText(briefing.summaryLine)]);
    const sub = summary.getRow(2);
    sub.font = BODY_FONT;
    sub.alignment = { wrapText: true, vertical: "top" };
    sub.height = wrappedRowHeight(
      sanitizeExcelText(briefing.summaryLine),
      85,
    );
    sub.getCell(1).border = GRID_BORDER;

    summary.addRow([]);
    for (const line of briefing.plaintext.split("\n")) {
      const text = sanitizeExcelText(line);
      const row = summary.addRow([text]);
      row.font = BODY_FONT;
      row.alignment = { wrapText: true, vertical: "top" };
      row.height = text.trim() ? wrappedRowHeight(text, 85) : 10;
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

import { datedExcelFilename } from "./excel-filename";
export { datedExcelFilename };

/** Email / briefing attachment name — same KST dated pattern. */
export function briefingFilename(date: string): string {
  return datedExcelFilename(date);
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
