import ExcelJS from "exceljs";
import {
  CATEGORY_LABEL,
  type CalendarEvent,
  type SideListItem,
  type Task,
} from "./types";
import { sortCompleted, sortTasks } from "./sort";
import type { DailyBriefing } from "./briefing";
import { formatCalendarWhen } from "./calendar-data";
import { formatDeadlineRange } from "./date-range";

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

  // Father TO DO LIST headers (exact): 순서 · 할일 LIST UP · 마감목표 · 중요도 · 시급성 · 완료여부
  const todo = wb.addWorksheet("할 일", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  todo.columns = [
    { header: "순서", key: "order", width: 8 },
    { header: "틀", key: "frame", width: 10 },
    { header: "할일 LIST UP", key: "listup", width: 48 },
    { header: "마감목표", key: "deadline", width: 22 },
    { header: "중요도", key: "importance", width: 10 },
    { header: "시급성", key: "urgency", width: 10 },
    { header: "완료여부", key: "done", width: 10 },
  ];
  styleHeader(todo.getRow(1));
  sortTasks(tasks).forEach((t, i) => {
    const listup = t.memo ? `${t.title}\n${t.memo}` : t.title;
    todo.addRow({
      order: i + 1,
      frame: CATEGORY_LABEL[t.category],
      listup,
      deadline: formatDeadlineRange(t),
      importance: t.importance,
      urgency: t.urgency,
      done: "",
    });
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

  const done = wb.addWorksheet("한 일", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  done.columns = [
    { header: "순서", key: "order", width: 8 },
    { header: "틀", key: "frame", width: 10 },
    { header: "할일 LIST UP", key: "listup", width: 48 },
    { header: "마감목표", key: "deadline", width: 22 },
    { header: "중요도", key: "importance", width: 10 },
    { header: "시급성", key: "urgency", width: 10 },
    { header: "완료여부", key: "done", width: 10 },
  ];
  styleHeader(done.getRow(1));
  sortCompleted(tasks).forEach((t, i) => {
    const listup = t.memo ? `${t.title}\n${t.memo}` : t.title;
    done.addRow({
      order: i + 1,
      frame: CATEGORY_LABEL[t.category],
      listup,
      deadline: formatDeadlineRange(t),
      importance: t.importance,
      urgency: t.urgency,
      done: "완료",
    });
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

  const cal = wb.addWorksheet("구글캘린더", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  cal.columns = [
    { header: "언제", key: "when", width: 18 },
    { header: "일정", key: "title", width: 34 },
    { header: "캘린더", key: "calendarName", width: 16 },
    { header: "메모", key: "notes", width: 24 },
    { header: "출처", key: "source", width: 10 },
  ];
  styleHeader(cal.getRow(1));
  for (const e of [...calendarEvents].sort((a, b) =>
    a.start.localeCompare(b.start),
  )) {
    cal.addRow({
      when: formatCalendarWhen(e),
      title: e.title,
      calendarName: e.calendarName || "",
      notes: e.notes,
      source: e.source,
    });
  }

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
