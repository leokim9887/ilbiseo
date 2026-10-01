import ExcelJS from "exceljs";
import { KIND_LABEL, type Task } from "./types";
import { sortCompleted, sortTasks } from "./sort";
import type { DailyBriefing } from "./briefing";

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

function statusLabel(t: Task): string {
  return t.status === "completed" ? "완료" : "진행";
}

export async function buildBriefingWorkbook(
  tasks: Task[],
  briefing: DailyBriefing,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "일비서";
  wb.created = new Date(briefing.generatedAt);

  const active = sortTasks(tasks);
  const completed = sortCompleted(tasks);

  // Sheet 1: 오늘 브리핑 (active snapshot)
  const sheet = wb.addWorksheet("오늘 브리핑", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "할 일", key: "title", width: 36 },
    { header: "유형", key: "kind", width: 14 },
    { header: "목표기일", key: "targetDate", width: 12 },
    { header: "중요", key: "importance", width: 8 },
    { header: "시급", key: "urgency", width: 8 },
    { header: "상태", key: "status", width: 8 },
    { header: "묶음", key: "groupKey", width: 16 },
    { header: "출처", key: "source", width: 10 },
    { header: "메모", key: "notes", width: 28 },
  ];
  styleHeader(sheet.getRow(1));

  for (const t of active) {
    sheet.addRow({
      title: t.title,
      kind: KIND_LABEL[t.kind],
      targetDate: t.targetDate ?? "",
      importance: t.importance,
      urgency: t.urgency,
      status: statusLabel(t),
      groupKey: t.groupKey,
      source: t.source,
      notes: t.notes,
    });
  }

  // Sheet 2: 브리핑 요약 (readable)
  const summary = wb.addWorksheet("브리핑 요약");
  summary.getColumn(1).width = 80;
  summary.addRow([briefing.headline]);
  summary.getRow(1).font = { bold: true, size: 14, color: { argb: "FF0B4F57" } };
  summary.addRow([briefing.summaryLine]);
  summary.addRow([`생성 시각: ${briefing.generatedAt}`]);
  summary.addRow([]);
  for (const line of briefing.plaintext.split("\n")) {
    summary.addRow([line]);
  }

  // Sheet 3: 완료 기록
  const done = wb.addWorksheet("완료 기록", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  done.columns = [
    { header: "할 일", key: "title", width: 36 },
    { header: "유형", key: "kind", width: 14 },
    { header: "목표기일", key: "targetDate", width: 12 },
    { header: "중요", key: "importance", width: 8 },
    { header: "시급", key: "urgency", width: 8 },
    { header: "완료일", key: "completedAt", width: 20 },
    { header: "메모", key: "notes", width: 28 },
  ];
  styleHeader(done.getRow(1));
  for (const t of completed) {
    done.addRow({
      title: t.title,
      kind: KIND_LABEL[t.kind],
      targetDate: t.targetDate ?? "",
      importance: t.importance,
      urgency: t.urgency,
      completedAt: t.completedAt
        ? new Date(t.completedAt).toLocaleString("ko-KR")
        : "",
      notes: t.notes,
    });
  }

  return wb.xlsx.writeBuffer();
}

export function briefingFilename(date: string): string {
  return `일비서-브리핑-${date}.xlsx`;
}

export function downloadXlsx(buffer: ArrayBuffer | ExcelJS.Buffer, filename: string) {
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
