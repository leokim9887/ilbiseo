/**
 * Dump Excel 마감목표 validation + note for screenshot / smoke.
 */
import fs from "fs";
import ExcelJS from "exceljs";
import {
  buildWorkbook,
  DEADLINE_ENTRY_HELP,
  deadlineValidationListFormula,
} from "../src/lib/excel";
import { todayIsoKst } from "../src/lib/date-range";
import type { Task } from "../src/lib/types";

const OUT =
  process.env.OUT_DIR || "/cursor/stores/self/media";
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const today = todayIsoKst();
  const formula = deadlineValidationListFormula(today);
  const tasks: Task[] = [
    {
      id: "1",
      title: "샘플",
      category: "work",
      kind: "spot",
      startDate: today,
      targetDate: today,
      urgency: 2,
      importance: 2,
      groupKey: "샘플",
      memo: "",
      source: "manual",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    },
    {
      id: "2",
      title: "언젠가할일",
      category: "work",
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
  ];
  const buf = await buildWorkbook({ tasks, calendarEvents: [] });
  fs.writeFileSync(
    `${OUT}/ilbiseo-excel-deadline-entry-sample.xlsx`,
    Buffer.from(buf as ArrayBuffer),
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const todo = wb.getWorksheet("할 일")!;
  const model =
    (
      todo as unknown as {
        dataValidations?: { model?: Record<string, ExcelJS.DataValidation> };
      }
    ).dataValidations?.model || {};
  const list = Object.values(model).find((v) => v?.type === "list");
  const note = todo.getCell(1, 4).note;
  const noteText =
    typeof note === "string"
      ? note
      : Array.isArray((note as { texts?: { text?: string }[] })?.texts)
        ? ((note as { texts: { text?: string }[] }).texts)
            .map((t) => t.text ?? "")
            .join("")
        : "";
  const out = {
    today,
    formula,
    help: DEADLINE_ENTRY_HELP,
    listFormulae: list?.formulae || [],
    noteText,
    prompt: list?.prompt || "",
    promptTitle: list?.promptTitle || "",
  };
  fs.writeFileSync(
    `${OUT}/smoke-excel-deadline-entry.json`,
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
