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

/** Father can click header ▾ arrows — no macros. */
function enableAutoFilter(sheet: ExcelJS.Worksheet, columnCount: number) {
  const lastRow = Math.max(sheet.rowCount, 1);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastRow, column: columnCount },
  };
}

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

  // Father TO DO LIST headers: 순서 · 할일 LIST UP · 마감목표 · 중요도 · 완료여부
  // (시급성 열은 제거 — 기존 파일 불러오기는 excel-import에서 선택 매핑)
  const todo = wb.addWorksheet("할 일", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  todo.columns = [
    { header: "순서", key: "order", width: 8 },
    { header: "틀", key: "frame", width: 10 },
    { header: "할일 LIST UP", key: "listup", width: 48 },
    { header: "마감목표", key: "deadline", width: 22 },
    { header: "중요도", key: "importance", width: 10 },
    { header: "완료여부", key: "done", width: 10 },
  ];
  styleHeader(todo.getRow(1));
  sortTasks(tasks).forEach((t, i) => {
    const listup = t.memo ? `${t.title}\n${t.memo}` : t.title;
    const row = todo.addRow({
      order: i + 1,
      // plain text — AutoFilter 그룹/정렬용 (업무용·개인용·과제용·팀원용)
      frame: CATEGORY_LABEL[t.category],
      listup,
      deadline: null,
      // number 1–3 so Excel sorts ascending/descending by value
      importance: Number(t.importance) || 0,
      done: "",
    });
    writeDeadlineCell(row.getCell(4), t); // 마감목표
  });
  todo.getColumn("listup").alignment = { wrapText: true, vertical: "top" };
  todo.getColumn("deadline").alignment = {
    wrapText: true,
    vertical: "middle",
    horizontal: "center",
  };
  todo.getColumn("frame").alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  todo.getColumn("importance").alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  enableAutoFilter(todo, 6);

  const done = wb.addWorksheet("한 일", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  done.columns = [
    { header: "순서", key: "order", width: 8 },
    { header: "틀", key: "frame", width: 10 },
    { header: "할일 LIST UP", key: "listup", width: 48 },
    { header: "마감목표", key: "deadline", width: 22 },
    { header: "중요도", key: "importance", width: 10 },
    { header: "완료여부", key: "done", width: 10 },
  ];
  styleHeader(done.getRow(1));
  sortCompleted(tasks).forEach((t, i) => {
    const listup = t.memo ? `${t.title}\n${t.memo}` : t.title;
    const row = done.addRow({
      order: i + 1,
      frame: CATEGORY_LABEL[t.category],
      listup,
      deadline: null,
      importance: Number(t.importance) || 0,
      done: "완료",
    });
    writeDeadlineCell(row.getCell(4), t); // 마감목표
  });
  done.getColumn("listup").alignment = { wrapText: true, vertical: "top" };
  done.getColumn("deadline").alignment = {
    wrapText: true,
    vertical: "middle",
    horizontal: "center",
  };
  done.getColumn("frame").alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  done.getColumn("importance").alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  enableAutoFilter(done, 6);

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
