import ExcelJS from "exceljs";
import {
  CATEGORY_LABEL,
  KIND_LABEL,
  type CalendarEvent,
  type ChecklistItem,
  type Task,
} from "./types";
import { sortCompleted, sortTasks } from "./sort";
import type { DailyBriefing } from "./briefing";
import { formatCalendarWhen } from "./calendar-data";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0B4F57" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: "FFFFFFFF" },
  bold: true,
  size: 11,
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 22;
}

export type WorkbookPayload = {
  tasks: Task[];
  checklists: ChecklistItem[];
  calendarEvents: CalendarEvent[];
  briefing?: DailyBriefing | null;
};

export async function buildWorkbook(
  payload: WorkbookPayload,
): Promise<ExcelJS.Buffer> {
  const { tasks, checklists, calendarEvents, briefing } = payload;
  const wb = new ExcelJS.Workbook();
  wb.creator = "일비서";
  wb.created = new Date();

  const todo = wb.addWorksheet("할 일", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  todo.columns = [
    { header: "틀", key: "category", width: 10 },
    { header: "할 일", key: "title", width: 34 },
    { header: "유형", key: "kind", width: 14 },
    { header: "목표기일", key: "targetDate", width: 12 },
    { header: "중요", key: "importance", width: 8 },
    { header: "시급", key: "urgency", width: 8 },
    { header: "묶음", key: "groupKey", width: 14 },
    { header: "메모", key: "memo", width: 24 },
    { header: "출처", key: "source", width: 10 },
  ];
  styleHeader(todo.getRow(1));
  for (const t of sortTasks(tasks)) {
    todo.addRow({
      category: CATEGORY_LABEL[t.category],
      title: t.title,
      kind: KIND_LABEL[t.kind],
      targetDate: t.targetDate ?? "",
      importance: t.importance,
      urgency: t.urgency,
      groupKey: t.groupKey,
      memo: t.memo,
      source: t.source,
    });
  }

  const done = wb.addWorksheet("한 일", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  done.columns = [
    { header: "틀", key: "category", width: 10 },
    { header: "한 일", key: "title", width: 34 },
    { header: "유형", key: "kind", width: 14 },
    { header: "목표기일", key: "targetDate", width: 12 },
    { header: "중요", key: "importance", width: 8 },
    { header: "시급", key: "urgency", width: 8 },
    { header: "완료일", key: "completedAt", width: 20 },
    { header: "메모", key: "memo", width: 24 },
  ];
  styleHeader(done.getRow(1));
  for (const t of sortCompleted(tasks)) {
    done.addRow({
      category: CATEGORY_LABEL[t.category],
      title: t.title,
      kind: KIND_LABEL[t.kind],
      targetDate: t.targetDate ?? "",
      importance: t.importance,
      urgency: t.urgency,
      completedAt: t.completedAt
        ? new Date(t.completedAt).toLocaleString("ko-KR")
        : "",
      memo: t.memo,
    });
  }

  const check = wb.addWorksheet("체크리스트", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  check.columns = [
    { header: "틀", key: "category", width: 10 },
    { header: "항목", key: "title", width: 36 },
    { header: "완료", key: "checked", width: 8 },
    { header: "완료일", key: "completedAt", width: 20 },
  ];
  styleHeader(check.getRow(1));
  for (const c of checklists) {
    check.addRow({
      category: CATEGORY_LABEL[c.category],
      title: c.title,
      checked: c.checked ? "Y" : "",
      completedAt: c.completedAt
        ? new Date(c.completedAt).toLocaleString("ko-KR")
        : "",
    });
  }

  const cal = wb.addWorksheet("구글캘린더", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  cal.columns = [
    { header: "언제", key: "when", width: 18 },
    { header: "일정", key: "title", width: 34 },
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
      notes: e.notes,
      source: e.source,
    });
  }

  if (briefing) {
    const summary = wb.addWorksheet("브리핑요약");
    summary.getColumn(1).width = 88;
    summary.addRow([briefing.headline]);
    summary.getRow(1).font = {
      bold: true,
      size: 14,
      color: { argb: "FF0B4F57" },
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
  checklists: ChecklistItem[] = [],
  calendarEvents: CalendarEvent[] = [],
) {
  return buildWorkbook({ tasks, checklists, calendarEvents, briefing });
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
