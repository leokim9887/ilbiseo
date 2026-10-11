import type { CalendarEvent } from "./types";

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDaysIso(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = b.slice(0, 10).split("-").map(Number);
  const ms =
    Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

function isDateOnly(iso: string): boolean {
  return iso.length === 10 || (!iso.includes("T") && /^\d{4}-\d{2}-\d{2}/.test(iso));
}

function isMidnightLocalOrZ(iso: string): boolean {
  // 00:00:00 with optional fraction / Z / offset
  return /T00:00:00(?:\.0+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(iso);
}

export type InclusiveDayRange = {
  /** First visible day YYYY-MM-DD */
  startDay: string;
  /** Last visible day YYYY-MM-DD (inclusive) */
  endDay: string;
  /** True when the event paints across 2+ day cells */
  multiDay: boolean;
};

/**
 * Inclusive display day range for month-grid / day chips.
 *
 * Google all-day uses exclusive end dates:
 * - `12~13` (end = start+1) → single day on start
 * - longer all-day → span start … end-1
 *
 * Timed multi-day → span startDay … endDay (if end is exactly midnight,
 * treat that day as exclusive so overnight-to-midnight stays single-day).
 */
export function eventInclusiveDayRange(
  ev: Pick<CalendarEvent, "start" | "end" | "allDay">,
): InclusiveDayRange {
  const startDay = ev.start.slice(0, 10);
  const endRaw = ev.end?.trim() || "";
  const endDayRaw = endRaw ? endRaw.slice(0, 10) : startDay;
  const allDay = ev.allDay || isDateOnly(ev.start);

  if (allDay) {
    if (!endRaw || endDayRaw === startDay) {
      return { startDay, endDay: startDay, multiDay: false };
    }
    // Exclusive end → last inclusive day is end - 1
    const endInclusive = addDaysIso(endDayRaw, -1);
    if (endInclusive < startDay) {
      return { startDay, endDay: startDay, multiDay: false };
    }
    return {
      startDay,
      endDay: endInclusive,
      multiDay: endInclusive > startDay,
    };
  }

  // Timed
  let endDay = endDayRaw || startDay;
  if (
    endRaw &&
    endDay > startDay &&
    isMidnightLocalOrZ(endRaw) &&
    dayDiff(startDay, endDay) === 1
  ) {
    // Ends at next-day midnight → still a single calendar day
    endDay = startDay;
  } else if (endRaw && endDay > startDay && isMidnightLocalOrZ(endRaw)) {
    // Multi-day timed ending at midnight: last occupied day is previous
    endDay = addDaysIso(endDay, -1);
    if (endDay < startDay) endDay = startDay;
  }

  if (endDay < startDay) {
    return { startDay, endDay: startDay, multiDay: false };
  }
  return {
    startDay,
    endDay,
    multiDay: endDay > startDay,
  };
}

/** True if the event occupies `day` on the month grid. */
export function eventOccursOnDay(
  ev: Pick<CalendarEvent, "start" | "end" | "allDay">,
  day: string,
): boolean {
  const { startDay, endDay } = eventInclusiveDayRange(ev);
  return startDay <= day && day <= endDay;
}
