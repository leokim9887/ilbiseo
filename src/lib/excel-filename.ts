import { todayIsoKst } from "./date-range";

/**
 * Excel save / download filename — always stamp with KST calendar date.
 * Pattern: `일비서_YYYY-MM-DD.xlsx` (e.g. 일비서_2026-10-18.xlsx)
 */
export function datedExcelFilename(d: Date | string = new Date()): string {
  const iso = typeof d === "string" ? d.slice(0, 10) : todayIsoKst(d);
  return `일비서_${iso}.xlsx`;
}
