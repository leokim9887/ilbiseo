"use client";

import { useMemo, useState } from "react";
import type { CalendarEvent, Task } from "@/lib/types";
import {
  monthRangeContaining,
  todayIso,
  weekRangeContaining,
} from "@/lib/date-range";
import {
  buildUnifiedItems,
  type UnifiedSort,
} from "@/lib/unified";
import { PanelShell } from "@/components/panel-shell";
import { Button } from "@/components/ui/button";
import { Layers, Lock } from "lucide-react";

interface UnifiedViewProps {
  tasks: Task[];
  events: CalendarEvent[];
  onOpenWorkbook: () => void;
  onOpenCalendar: () => void;
}

export function UnifiedView({
  tasks,
  events,
  onOpenWorkbook,
  onOpenCalendar,
}: UnifiedViewProps) {
  const today = todayIso();
  const [filterStart, setFilterStart] = useState(today);
  const [filterEnd, setFilterEnd] = useState(today);
  const [sort, setSort] = useState<UnifiedSort>("time");
  const [chip, setChip] = useState<"today" | "week" | "month" | "custom">(
    "today",
  );

  const items = useMemo(
    () =>
      buildUnifiedItems(tasks, events, {
        filterStart: filterStart || null,
        filterEnd: filterEnd || null,
        sort,
        activeOnly: true,
      }),
    [tasks, events, filterStart, filterEnd, sort],
  );

  const taskCount = items.filter((i) => i.source === "task").length;
  const calCount = items.filter((i) => i.source === "calendar").length;

  const setToday = () => {
    setFilterStart(today);
    setFilterEnd(today);
    setChip("today");
  };
  const setWeek = () => {
    const w = weekRangeContaining(today);
    setFilterStart(w.start);
    setFilterEnd(w.end);
    setChip("week");
  };
  const setMonth = () => {
    const m = monthRangeContaining(today);
    setFilterStart(m.start);
    setFilterEnd(m.end);
    setChip("month");
  };

  return (
    <PanelShell
      title="통합 보기"
      description="오늘·기간에 할 일과 구글 캘린더를 한 목록으로 봅니다. 출처 뱃지로 구분하며, 캘린더는 읽기 전용입니다."
      icon={<Layers className="size-5" />}
      actions={
        <>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="min-h-11"
            onClick={onOpenWorkbook}
          >
            엑셀 할 일
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="min-h-11"
            onClick={onOpenCalendar}
          >
            캘린더만
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/40 px-3 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-[var(--ink-muted)]">
              기간 시작
            </span>
            <input
              type="date"
              aria-label="통합 기간 시작일"
              className="h-9 rounded-md border border-[var(--grid-line)] bg-white px-2 text-sm"
              value={filterStart}
              onChange={(e) => {
                setFilterStart(e.target.value);
                setChip("custom");
              }}
            />
          </div>
          <span className="pb-2 text-[var(--ink-muted)]">~</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-[var(--ink-muted)]">
              기간 종료
            </span>
            <input
              type="date"
              aria-label="통합 기간 종료일"
              className="h-9 rounded-md border border-[var(--grid-line)] bg-white px-2 text-sm"
              value={filterEnd}
              onChange={(e) => {
                setFilterEnd(e.target.value);
                setChip("custom");
              }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            {(
              [
                ["today", "오늘", setToday],
                ["week", "이번 주", setWeek],
                ["month", "이번 달", setMonth],
              ] as const
            ).map(([id, label, fn]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={chip === id ? "default" : "outline"}
                className={
                  chip === id
                    ? "bg-[#217346] text-white hover:bg-[#1a5c38]"
                    : ""
                }
                onClick={fn}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-[var(--ink-muted)]">
              정렬
            </span>
            <select
              aria-label="통합 정렬"
              className="h-9 rounded-md border border-[var(--grid-line)] bg-white px-2 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as UnifiedSort)}
            >
              <option value="time">시간순</option>
              <option value="importance">중요·시급 우선 (할 일)</option>
            </select>
          </div>
        </div>

        <p className="text-sm text-[var(--ink-muted)]">
          할 일 {taskCount}건 · 캘린더 {calCount}건 ·{" "}
          <span className="inline-flex items-center gap-1">
            <span className="rounded bg-[#e8f2ec] px-1.5 py-0.5 text-[11px] font-semibold text-[#1a5c38]">
              할 일
            </span>
            엑셀에서 수정
          </span>
          {" · "}
          <span className="inline-flex items-center gap-1">
            <span className="rounded bg-[#e8eef8] px-1.5 py-0.5 text-[11px] font-semibold text-[#1a3a6b]">
              캘린더
            </span>
            읽기 전용 (ICS/Google)
          </span>
        </p>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--grid-line)] px-4 py-12 text-center">
            <p className="font-semibold text-[var(--ink)]">
              이 기간에 표시할 항목이 없습니다
            </p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              엑셀 할 일에 날짜를 넣거나, 캘린더에서 ICS·Google을 불러오세요.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button type="button" size="lg" onClick={onOpenWorkbook}>
                할 일 열기
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={onOpenCalendar}
              >
                캘린더 열기
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-2" aria-label="통합 일정 목록">
            {items.map((item) => (
              <li
                key={item.id}
                className={`rounded-xl border border-[var(--grid-line)] border-l-[4px] bg-[var(--sheet)] px-3 py-3 sm:px-4 ${
                  item.accent === "calendar"
                    ? "border-l-[#3b6ea5] bg-[#f4f7fb]"
                    : "border-l-[#217346] bg-[#f7faf8]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${
                          item.source === "calendar"
                            ? "bg-[#3b6ea5] text-white"
                            : "bg-[#217346] text-white"
                        }`}
                      >
                        {item.badge}
                      </span>
                      {item.readOnly ? (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--ink-muted)]">
                          <Lock className="size-3" aria-hidden />
                          수정 불가
                        </span>
                      ) : null}
                      <span className="text-[12px] font-medium text-[var(--ink-muted)]">
                        {item.whenLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-base font-semibold text-[var(--ink)]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
                      {item.meta}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-[var(--ink-muted)]">
          ※ 엑셀 6열 장부에는 할 일만 들어갑니다. 캘린더 일정은 이 통합 목록·브리핑·캘린더
          메뉴에만 보이며 칸을 고칠 수 없습니다.
        </p>
      </div>
    </PanelShell>
  );
}
