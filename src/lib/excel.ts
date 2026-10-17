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
 * Excel Table with per-column filter arrows.
 * ▾ only on 틀 · 마감목표 · 중요도 — 순서 / 할일 LIST UP / 완료여부 have
 * filterButton:false (OOXML hiddenButton) so father cannot sort those cols.
 */
const TODO_TABLE_COLUMNS: ExcelJS.TableColumnProperties[] = [
  { name: "순서", filterButton: false },
  { name: "틀", filterButton: true },
  { name: "할일 LIST UP", filterButton: false },
  { name: "마감목표", filterButton: true },
  { name: "중요도", filterButton: true },
  { name: "완료여부", filterButton: false },
];

/** 마감목표: real Excel date (start) so Oldest/Newest sort works. */
function writeDeadlineCell(
  cell: ExcelJS.Cell,
  task: Pick<Task, "startDate" | "targetDate" | "kind">,
) {
  const parts = deadlineExcelParts(task);
  if (parts.kind === "date") {
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
  return parts.value;
}

function enableSortableTodoTable(
  sheet: ExcelJS.Worksheet,
  tableName: string,
  dataRows: ExcelJS.CellValue[][],
  tasksForDeadlineFmt: Pick<Task, "startDate" | "targetDate" | "kind">[],
) {
  // Clear any sheet-level AutoFilter — table owns filter arrows
  sheet.autoFilter = undefined;
  sheet.addTable({
    name: tableName,
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: {
      // Light theme; we re-apply classic gray header below
      theme: "TableStyleMedium1",
      showRowStripes: false,
      showColumnStripes: false,
    },
    columns: TODO_TABLE_COLUMNS,
    rows: dataRows,
  });
  styleHeader(sheet.getRow(1));
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 10;
  sheet.getColumn(3).width = 48;
  sheet.getColumn(4).width = 22;
  sheet.getColumn(5).width = 10;
  sheet.getColumn(6).width = 10;
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
  // addTable overwrites cells — restore date numFmt (incl. range display)
  tasksForDeadlineFmt.forEach((t, i) => {
    writeDeadlineCell(sheet.getRow(i + 2).getCell(4), t);
  });
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
  sheet.columns = [
    { header: "순서", key: "order", width: 8 },
    { header: "내용", key: "title", width: 40 },
    { header: "메모", key: "memo", width: 28 },
    { header: "완료", key: "done", width: 10 },
  ];
  styleHeader(sheet.getRow(1));
  items.forEach((item, i) => {
    sheet.addRow({
      order: i + 1,
      title: item.title,
      memo: item.memo,
      done: item.done ? "완료" : "",
    });
  });
}

export async function buildWorkbook(
  payload: WorkbookPayload,
): Promise<ExcelJS.Buffer> {
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
    t.memo ? `${t.title}\n${t.memo}` : t.title,
    deadlineCellValue(t),
    Number(t.importance) || 0,
    "",
  ]);
  enableSortableTodoTable(todo, "IlbiseoTodo", todoRows, activeTasks);

  const done = wb.addWorksheet("한 일", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const completedTasks = sortCompleted(tasks);
  const doneRows: ExcelJS.CellValue[][] = completedTasks.map((t, i) => [
    i + 1,
    CATEGORY_LABEL[t.category],
    t.memo ? `${t.title}\n${t.memo}` : t.title,
    deadlineCellValue(t),
    Number(t.importance) || 0,
    "완료",
  ]);
  enableSortableTodoTable(done, "IlbiseoDone", doneRows, completedTasks);

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
      when: formatCalendarWhen(e),
      title: e.title,
      notes: e.notes,
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
    summary.addRow([briefing.headline]);
    summary.getRow(1).font = {
      bold: true,
      size: 14,
      color: { argb: "FF163F39" },
    };
    summary.addRow([briefing.summaryLine]);
    summary.addRow([]);
    for (const line of briefing.plaintext.split("\n")) {
      summary.addRow([line]);
    }
  }

  return wb.xlsx.writeBuffer();
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
