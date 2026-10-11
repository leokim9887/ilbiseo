"use client";

import { useMemo } from "react";
import type { CalendarEvent } from "@/lib/types";
import { formatCalendarWhen } from "@/lib/calendar-data";
import {
  eventInclusiveDayRange,
  eventOccursOnDay,
} from "@/lib/calendar-span";
import { todayIsoKst } from "@/lib/date-range";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function monthLabelKo(year: number, monthIndex: number): string {
  return `${year}년 ${monthIndex + 1}월`;
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

interface MonthCalendarGridProps {
  events: CalendarEvent[];
  year: number;
  monthIndex: number; // 0–11
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToday: () => void;
}

export function MonthCalendarGrid({
  events,
  year,
  monthIndex,
  onPrevMonth,
  onNextMonth,
  onGoToday,
}: MonthCalendarGridProps) {
  const today = todayIsoKst();
  const cells = useMemo(
    () => daysInMonthGrid(year, monthIndex),
    [year, monthIndex],
  );
  const weeks = useMemo(() => buildWeekModels(cells, events), [cells, events]);

  return (
    <div className="space-y-3" data-month-calendar>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-semibold text-[var(--ink)]">
          {monthLabelKo(year, monthIndex)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9"
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
            className="min-h-9"
            onClick={onGoToday}
          >
            오늘
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9"
            onClick={onNextMonth}
            aria-label="다음 달"
          >
            다음
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-xl border border-[var(--grid-line)] bg-[var(--sheet)]"
        role="grid"
        aria-label={`${monthLabelKo(year, monthIndex)} 캘린더`}
      >
        <div className="grid grid-cols-7 border-b border-[var(--grid-line)] bg-[var(--sheet-header)]/70">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-1 py-2 text-center text-[12px] font-semibold text-[var(--ink-muted)] sm:text-[13px]"
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
                      className="min-h-[5.5rem] border-r border-[var(--grid-line)] bg-[var(--sheet-header)]/20 sm:min-h-[6.5rem]"
                      aria-hidden
                    />
                  );
                }
                const dayEvents = week.singles.get(day) ?? [];
                const isToday = day === today;
                const isSun = di === 0;
                const isSat = di === 6;
                return (
                  <div
                    key={day}
                    role="gridcell"
                    data-cal-day={day}
                    className={`min-h-[5.5rem] border-r border-[var(--grid-line)] p-1 sm:min-h-[6.5rem] sm:p-1.5 ${
                      isToday ? "bg-[#e8f5ee]" : "bg-white"
                    }`}
                  >
                    <p
                      className={`mb-1 text-[12px] font-semibold tabular-nums sm:text-[13px] ${
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
                        <span className="ml-1 text-[10px] font-medium">
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
                      {dayEvents.slice(0, 3).map((ev) => (
                        <li
                          key={ev.id}
                          className="truncate rounded-sm border-l-2 border-l-[#3b6ea5] bg-[#eef3fa] px-1 py-0.5 text-[11px] leading-snug text-[var(--ink)] sm:text-[12px]"
                          title={`${ev.title} · ${formatCalendarWhen(ev)}`}
                          data-cal-event={ev.id}
                          data-cal-single="1"
                        >
                          {ev.allDay || ev.start.length === 10
                            ? ev.title
                            : `${formatCalendarWhen(ev)} ${ev.title}`}
                        </li>
                      ))}
                      {dayEvents.length > 3 ? (
                        <li className="px-1 text-[10px] text-[var(--ink-muted)]">
                          +{dayEvents.length - 3}건
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
                    title={`${seg.event.title} · ${range.startDay} ~ ${range.endDay}`}
                    className={`pointer-events-none absolute z-[1] truncate px-1.5 py-0.5 text-[11px] font-medium leading-tight text-white sm:text-[12px] ${
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
  );
}
