"use client";

import { useMemo } from "react";
import type { CalendarEvent } from "@/lib/types";
import { eventsOnDay } from "@/lib/sheet-rows";
import { formatCalendarWhen } from "@/lib/calendar-data";
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
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) {
              return (
                <div
                  key={`pad-${i}`}
                  className="min-h-[5.5rem] border-b border-r border-[var(--grid-line)] bg-[var(--sheet-header)]/20 sm:min-h-[6.5rem]"
                  aria-hidden
                />
              );
            }
            const dayEvents = eventsOnDay(events, day);
            const isToday = day === today;
            const isSun = i % 7 === 0;
            const isSat = i % 7 === 6;
            return (
              <div
                key={day}
                role="gridcell"
                data-cal-day={day}
                className={`min-h-[5.5rem] border-b border-r border-[var(--grid-line)] p-1 sm:min-h-[6.5rem] sm:p-1.5 ${
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
                    <span className="ml-1 text-[10px] font-medium">오늘</span>
                  ) : null}
                </p>
                <ul className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <li
                      key={ev.id}
                      className="truncate rounded-sm border-l-2 border-l-[#3b6ea5] bg-[#eef3fa] px-1 py-0.5 text-[11px] leading-snug text-[var(--ink)] sm:text-[12px]"
                      title={`${ev.title} · ${formatCalendarWhen(ev)}`}
                      data-cal-event={ev.id}
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
        </div>
      </div>
    </div>
  );
}
