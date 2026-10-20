"use client";

import { useMemo, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import {
  displayCalendarLabel,
  formatCalendarDayDetailWhen,
  formatCalendarWhen,
} from "@/lib/calendar-data";
import {
  eventInclusiveDayRange,
  eventOccursOnDay,
} from "@/lib/calendar-span";
import { formatDisplayDateRange, todayIsoKst } from "@/lib/date-range";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const CHIP_LIMIT = 3;

function monthLabelKo(year: number, monthIndex: number): string {
  return `${year}년 ${monthIndex + 1}월`;
}

function dayHeadingKo(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()]!;
  return `${y}년 ${m}월 ${d}일 (${wd})`;
}

function daysInMonthGrid(year: number, monthIndex: number): (string | null)[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = first.getDay(); // 0 Sun
  const lastDate = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) {
    const m = String(monthIndex + 1).padStart(2, "0");
    const day = String(d).padStart(2, "0");
    cells.push(`${year}-${m}-${day}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function compareEventsForDay(a: CalendarEvent, b: CalendarEvent): number {
  const aAll = a.allDay || a.start.length === 10;
  const bAll = b.allDay || b.start.length === 10;
  if (aAll !== bAll) return aAll ? -1 : 1;
  return (
    a.start.localeCompare(b.start) ||
    a.title.localeCompare(b.title, "ko")
  );
}

function eventsOnDay(events: CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((ev) => eventOccursOnDay(ev, day)).sort(compareEventsForDay);
}

type SpanSeg = {
  event: CalendarEvent;
  /** 0–6 within the week row */
  colStart: number;
  /** exclusive end column 1–7 */
  colEnd: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
};

type WeekModel = {
  days: (string | null)[];
  /** Single-day chips keyed by day ISO */
  singles: Map<string, CalendarEvent[]>;
  spans: SpanSeg[];
  maxLane: number;
};

function buildWeekModels(
  cells: (string | null)[],
  events: CalendarEvent[],
): WeekModel[] {
  const weeks: WeekModel[] = [];
  for (let w = 0; w < cells.length; w += 7) {
    const days = cells.slice(w, w + 7);
    const weekStart = days.find((d) => d != null) ?? null;
    const weekEnd =
      [...days].reverse().find((d) => d != null) ?? null;

    const singles = new Map<string, CalendarEvent[]>();
    for (const day of days) {
      if (day) singles.set(day, []);
    }

    type RawSpan = {
      event: CalendarEvent;
      colStart: number;
      colEnd: number;
      continuesLeft: boolean;
      continuesRight: boolean;
    };
    const rawSpans: RawSpan[] = [];

    for (const ev of events) {
      const range = eventInclusiveDayRange(ev);
      if (!range.multiDay) {
        for (const day of days) {
          if (day && eventOccursOnDay(ev, day)) {
            singles.get(day)!.push(ev);
          }
        }
        continue;
      }
      if (!weekStart || !weekEnd) continue;
      if (range.endDay < weekStart || range.startDay > weekEnd) continue;

      let colStart = -1;
      let colEnd = -1;
      for (let i = 0; i < 7; i++) {
        const day = days[i];
        if (!day) continue;
        if (day >= range.startDay && day <= range.endDay) {
          if (colStart < 0) colStart = i;
          colEnd = i + 1;
        }
      }
      if (colStart < 0 || colEnd < 0) continue;
      rawSpans.push({
        event: ev,
        colStart,
        colEnd,
        continuesLeft: range.startDay < (days[colStart] as string),
        continuesRight:
          range.endDay > (days[colEnd - 1] as string),
      });
    }

    // Stable order: earlier start, then longer, then title
    rawSpans.sort((a, b) => {
      const ra = eventInclusiveDayRange(a.event);
      const rb = eventInclusiveDayRange(b.event);
      return (
        ra.startDay.localeCompare(rb.startDay) ||
        rb.endDay.localeCompare(ra.endDay) ||
        a.event.title.localeCompare(b.event.title, "ko")
      );
    });

    const laneEnds: number[] = [];
    const spans: SpanSeg[] = [];
    for (const s of rawSpans) {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane]! > s.colStart) {
        lane += 1;
      }
      laneEnds[lane] = s.colEnd;
      spans.push({ ...s, lane });
    }

    weeks.push({
      days,
      singles,
      spans,
      maxLane: Math.max(0, ...spans.map((s) => s.lane + 1)),
    });
  }
  return weeks;
}

const MONTH_OPTIONS = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
] as const;

function yearOptionsAround(selectedYear: number, todayYear: number): number[] {
  const start = Math.min(todayYear - 10, selectedYear);
  const end = Math.max(todayYear + 5, selectedYear);
  const years: number[] = [];
  for (let y = start; y <= end; y++) years.push(y);
  return years;
}

const pickerSelectClass =
  "min-h-9 cursor-pointer appearance-auto rounded-lg border border-[var(--grid-line)] bg-[var(--sheet)] px-2.5 py-1.5 text-base font-semibold tabular-nums text-[var(--ink)] shadow-none outline-none transition-colors hover:border-[#217346]/45 focus-visible:border-[#217346] focus-visible:ring-2 focus-visible:ring-[#217346]/25";

interface MonthCalendarGridProps {
  events: CalendarEvent[];
  year: number;
  monthIndex: number; // 0–11
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToday: () => void;
  onChangeYearMonth: (year: number, monthIndex: number) => void;
}

export function MonthCalendarGrid({
  events,
  year,
  monthIndex,
  onPrevMonth,
  onNextMonth,
  onGoToday,
  onChangeYearMonth,
}: MonthCalendarGridProps) {
  const today = todayIsoKst();
  const todayYear = Number(today.slice(0, 4));
  const years = useMemo(
    () => yearOptionsAround(year, todayYear),
    [year, todayYear],
  );
  const cells = useMemo(
    () => daysInMonthGrid(year, monthIndex),
    [year, monthIndex],
  );
  const weeks = useMemo(() => buildWeekModels(cells, events), [cells, events]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const detailEvents = useMemo(
    () => (selectedDay ? eventsOnDay(events, selectedDay) : []),
    [events, selectedDay],
  );

  const openDay = (day: string) => {
    if (eventsOnDay(events, day).length === 0) return;
    setSelectedDay(day);
  };

  return (
    <div className="space-y-3" data-month-calendar>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap items-center gap-1.5"
          data-cal-year-month-picker
        >
          <label className="sr-only" htmlFor="cal-year-select">
            연도
          </label>
          <select
            id="cal-year-select"
            data-cal-year-select
            className={pickerSelectClass}
            value={year}
            aria-label="연도 선택"
            onChange={(e) =>
              onChangeYearMonth(Number(e.target.value), monthIndex)
            }
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="cal-month-select">
            월
          </label>
          <select
            id="cal-month-select"
            data-cal-month-select
            className={pickerSelectClass}
            value={monthIndex}
            aria-label="월 선택"
            onChange={(e) =>
              onChangeYearMonth(year, Number(e.target.value))
            }
          >
            {MONTH_OPTIONS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 touch-manipulation sm:min-h-9"
            onClick={onPrevMonth}
            aria-label="이전 달"
          >
            <ChevronLeft className="size-4" />
            이전
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 touch-manipulation sm:min-h-9"
            onClick={onGoToday}
          >
            오늘
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 touch-manipulation sm:min-h-9"
            onClick={onNextMonth}
            aria-label="다음 달"
          >
            다음
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div
        className="-mx-0.5 overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--grid-line)] bg-[var(--sheet)] sm:mx-0 sm:overflow-hidden"
        role="grid"
        aria-label={`${monthLabelKo(year, monthIndex)} 캘린더`}
      >
        <div className="min-w-[min(100%,22rem)] sm:min-w-0">
        <div className="grid grid-cols-7 border-b border-[var(--grid-line)] bg-[var(--sheet-header)]/70">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-0.5 py-2 text-center text-[12px] font-semibold text-[var(--ink-muted)] sm:px-1 sm:py-2.5 sm:text-[14px]"
              role="columnheader"
            >
              {w}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => {
          const spanTrackH = week.maxLane > 0 ? week.maxLane * 22 + 4 : 0;
          return (
            <div
              key={`week-${wi}`}
              className="relative grid grid-cols-7 border-b border-[var(--grid-line)] last:border-b-0"
              data-cal-week={wi}
            >
              {week.days.map((day, di) => {
                if (!day) {
                  return (
                    <div
                      key={`pad-${wi}-${di}`}
                      className="min-h-[4.75rem] border-r border-[var(--grid-line)] bg-[var(--sheet-header)]/20 sm:min-h-[7rem]"
                      aria-hidden
                    />
                  );
                }
                const dayEvents = week.singles.get(day) ?? [];
                const dayTotal = eventsOnDay(events, day).length;
                const overflow = Math.max(0, dayEvents.length - CHIP_LIMIT);
                const isToday = day === today;
                const isSun = di === 0;
                const isSat = di === 6;
                const canOpen = dayTotal > 0;
                return (
                  <div
                    key={day}
                    role="gridcell"
                    data-cal-day={day}
                    data-cal-day-count={dayTotal}
                    tabIndex={canOpen ? 0 : undefined}
                    aria-label={
                      canOpen
                        ? `${dayHeadingKo(day)} 일정 ${dayTotal}건 보기`
                        : undefined
                    }
                    onClick={() => openDay(day)}
                    onKeyDown={(e) => {
                      if (!canOpen) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDay(day);
                      }
                    }}
                    className={`min-h-[4.75rem] border-r border-[var(--grid-line)] p-1 touch-manipulation sm:min-h-[7rem] sm:p-2 ${
                      isToday
                        ? "bg-[#e8f5ee] dark:bg-[#1e332d]"
                        : "bg-white dark:bg-[#1a221e]"
                    } ${
                      canOpen
                        ? "cursor-pointer transition-colors hover:bg-[#f3f7f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#217346]/35 dark:hover:bg-[#24302a]"
                        : ""
                    }`}
                  >
                    <p
                      className={`mb-0.5 text-[12px] font-semibold tabular-nums sm:mb-1 sm:text-[14px] ${
                        isToday
                          ? "text-[#217346]"
                          : isSun
                            ? "text-[#b42318]"
                            : isSat
                              ? "text-[#3b6ea5]"
                              : "text-[var(--ink)]"
                      }`}
                    >
                      {Number(day.slice(8, 10))}
                      {isToday ? (
                        <span className="ml-0.5 text-[10px] font-medium sm:ml-1 sm:text-[12px]">
                          오늘
                        </span>
                      ) : null}
                    </p>
                    {/* Reserve space so single chips sit below span bars */}
                    {spanTrackH > 0 ? (
                      <div
                        aria-hidden
                        style={{ height: spanTrackH }}
                        className="mb-0.5"
                      />
                    ) : null}
                    <ul className="space-y-0.5">
                      {dayEvents.slice(0, CHIP_LIMIT).map((ev) => (
                        <li
                          key={ev.id}
                          className="truncate rounded-sm border-l-2 border-l-[#3b6ea5] bg-[#eef3fa] px-1 py-0.5 text-[10px] leading-snug text-[#1a2420] dark:border-l-[#6a9bc4] dark:bg-[#1e2a38] dark:text-[#e8ece9] sm:px-1.5 sm:py-1 sm:text-[13px]"
                          title={`${ev.title} · ${formatCalendarWhen(ev)}`}
                          data-cal-event={ev.id}
                          data-cal-single="1"
                        >
                          {ev.allDay || ev.start.length === 10
                            ? ev.title
                            : `${formatCalendarWhen(ev)} ${ev.title}`}
                        </li>
                      ))}
                      {overflow > 0 ? (
                        <li>
                          <button
                            type="button"
                            data-cal-overflow
                            className="min-h-7 touch-manipulation rounded px-1 text-[11px] font-semibold text-[var(--ink-muted)] underline-offset-2 hover:text-[#217346] hover:underline sm:text-[12px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDay(day);
                            }}
                          >
                            +{overflow}건
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}

              {/* Continuous multi-day bars across consecutive day cells */}
              {week.spans.map((seg) => {
                const left = `${(seg.colStart / 7) * 100}%`;
                const width = `${((seg.colEnd - seg.colStart) / 7) * 100}%`;
                const top = 28 + seg.lane * 22;
                const range = eventInclusiveDayRange(seg.event);
                return (
                  <div
                    key={`${seg.event.id}-w${wi}-l${seg.lane}`}
                    data-cal-span={seg.event.id}
                    data-cal-span-start={range.startDay}
                    data-cal-span-end={range.endDay}
                    title={`${seg.event.title} · ${formatDisplayDateRange(range.startDay, range.endDay)}`}
                    className={`pointer-events-none absolute z-[1] truncate px-1.5 py-1 text-[12px] font-medium leading-snug text-white sm:text-[13px] ${
                      seg.continuesLeft ? "rounded-l-none" : "rounded-l-md"
                    } ${
                      seg.continuesRight ? "rounded-r-none" : "rounded-r-md"
                    } bg-[#3b6ea5] shadow-sm`}
                    style={{
                      left: `calc(${left} + 2px)`,
                      width: `calc(${width} - 4px)`,
                      top,
                    }}
                  >
                    {seg.continuesLeft ? "… " : ""}
                    {seg.event.title}
                    {seg.continuesRight ? " …" : ""}
                  </div>
                );
              })}
            </div>
          );
        })}
        </div>
      </div>

      <Sheet
        open={selectedDay != null}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        <SheetContent
          side="bottom"
          data-cal-day-detail
          className="max-h-[min(88dvh,40rem)] w-full max-w-none gap-0 rounded-t-2xl border-[var(--grid-line)] bg-[var(--sheet)] p-0"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          }}
        >
          <SheetHeader className="border-b border-[var(--grid-line)] bg-[var(--sheet-header)]/50 px-4 py-3.5 pr-12">
            <SheetTitle className="text-[16px] font-semibold text-[var(--ink)]">
              {selectedDay ? dayHeadingKo(selectedDay) : "일정"}
            </SheetTitle>
            <SheetDescription className="text-[14px] text-[var(--ink-muted)]">
              {detailEvents.length > 0
                ? `이 날 일정 ${detailEvents.length}건`
                : "일정이 없습니다"}
            </SheetDescription>
          </SheetHeader>
          <ul
            className="min-h-0 flex-1 space-y-0 overflow-y-auto px-3 py-2"
            data-cal-day-detail-list
          >
            {detailEvents.map((ev) => {
              const multi = eventInclusiveDayRange(ev).multiDay;
              const calLabel = displayCalendarLabel(ev.calendarName);
              return (
                <li
                  key={ev.id}
                  data-cal-day-detail-event={ev.id}
                  data-cal-day-detail-span={multi ? "1" : "0"}
                  className="border-b border-[var(--grid-line)]/70 px-1 py-3.5 last:border-b-0"
                >
                  <p className="text-[15px] leading-snug font-medium break-words text-[var(--ink)]">
                    {ev.title}
                  </p>
                  <p className="mt-1 text-[13px] tabular-nums text-[var(--ink-muted)]">
                    {formatCalendarDayDetailWhen(ev)}
                  </p>
                  {calLabel ? (
                    <p className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
                      {calLabel}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
