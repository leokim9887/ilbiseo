import { addDaysIso, todayIsoKst } from "./date-range";

/**
 * Excel save / download filename — always stamp with KST calendar date.
 * Pattern: `일비서_YYYY-MM-DD.xlsx` (e.g. 일비서_2026-10-18.xlsx)
 */
export function datedExcelFilename(d: Date | string = new Date()): string {
  const iso = typeof d === "string" ? d.slice(0, 10) : todayIsoKst(d);
  return `일비서_${iso}.xlsx`;
}

/**
 * Milliseconds until the next Asia/Seoul calendar midnight.
 * Used to auto-rename the linked Excel file when the KST day rolls.
 */
export function msUntilNextKstMidnight(now = new Date()): number {
  const today = todayIsoKst(now);
  const tomorrow = addDaysIso(today, 1);
  const [y, m, d] = tomorrow.split("-").map(Number);
  // Midnight KST on `tomorrow` = that UTC calendar midnight minus 9 hours.
  const nextMidnightUtcMs =
    Date.UTC(y, m - 1, d, 0, 0, 0) - 9 * 60 * 60 * 1000;
  return Math.max(1_000, nextMidnightUtcMs - now.getTime());
}
