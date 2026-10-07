"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  FRAME_LABEL,
  FRAME_ORDER,
  isTaskCategory,
  type CalendarEvent,
  type FrameId,
  type Task,
  type TaskCategory,
} from "@/lib/types";
import {
  buildGcalFrameRows,
  buildTaskOnlyRows,
  calendarListUpTitle,
  formatEventDeadline,
  type SheetRow,
} from "@/lib/sheet-rows";
import {
  formatDeadlineRange,
  monthRangeContaining,
  todayIso,
  weekRangeContaining,
  type PeriodSort,
} from "@/lib/date-range";
import {
  applyColumnSort,
  columnSortLabel,
  cycleColumnSort,
  isSortableCol,
  type ColumnSort,
  type ColumnSortKey,
} from "@/lib/column-sort";
import { Button } from "@/components/ui/button";
import { MemoImport } from "@/components/memo-import";
import { OcrImport } from "@/components/ocr-import";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, X } from "lucide-react";

export type WorkbookSheet = "todo" | "done";

type ColKey = "order" | "listup" | "deadline" | "importance" | "urgency" | "done";

const COLS: { key: ColKey; label: string; width: string }[] = [
  { key: "order", label: "순서", width: "56px" },
  { key: "listup", label: "할일 LIST UP", width: "42%" },
  { key: "deadline", label: "마감목표", width: "168px" },
  { key: "importance", label: "중요도", width: "72px" },
  { key: "urgency", label: "시급성", width: "72px" },
  { key: "done", label: "완료여부", width: "84px" },
];

const EDITABLE: ColKey[] = ["listup", "deadline", "importance", "urgency"];

type FocusCell = { rowId: string; col: ColKey };

interface ExcelWorkbookProps {
  sheet: WorkbookSheet;
  onSheetChange: (sheet: WorkbookSheet) => void;
  frame: FrameId;
  onFrameChange: (f: FrameId) => void;
  /** Tasks for the selected program frame (ignored when frame=gcal) */
  activeTasks: Task[];
  doneTasks: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onImport: (tasks: Task[]) => void;
  calendarEvents?: CalendarEvent[];
}

export function ExcelWorkbook({
  sheet,
  onSheetChange,
  frame,
  onFrameChange,
  activeTasks,
  doneTasks,
  onUpdate,
  onComplete,
  onRestore,
  onDelete,
  onAdd,
  onImport,
  calendarEvents = [],
}: ExcelWorkbookProps) {
  const isGcal = frame === "gcal";
  const [focus, setFocus] = useState<FocusCell | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [filterStart, setFilterStart] = useState<string>("");
  const [filterEnd, setFilterEnd] = useState<string>("");
  const [periodSort, setPeriodSort] = useState<PeriodSort>("default");
  /** Excel header column sort — overrides period dropdown when set */
  const [columnSort, setColumnSort] = useState<ColumnSort | null>(null);
  const [chip, setChip] = useState<"all" | "today" | "week" | "month">("all");
  const [gcalRangeStart, setGcalRangeStart] = useState("");
  const [gcalRangeEnd, setGcalRangeEnd] = useState("");
  const [gcalChip, setGcalChip] = useState<
    "none" | "today" | "week" | "month"
  >("none");
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    [],
  );

  const baseTasks = sheet === "todo" ? activeTasks : doneTasks;

  const rows = useMemo(() => {
    let built: SheetRow[];
    if (isGcal && sheet === "todo") {
      built = buildGcalFrameRows(calendarEvents, {
        rangeStart: gcalRangeStart || null,
        rangeEnd: gcalRangeEnd || null,
      });
    } else if (isGcal && sheet === "done") {
      built = [];
    } else {
      built = buildTaskOnlyRows(baseTasks, {
        filterStart: filterStart || null,
        filterEnd: filterEnd || null,
        // Column sort takes over ordering; keep period filter only
        periodSort: columnSort ? "default" : periodSort,
      });
    }
    return applyColumnSort(built, columnSort);
  }, [
    isGcal,
    sheet,
    calendarEvents,
    gcalRangeStart,
    gcalRangeEnd,
    baseTasks,
    filterStart,
    filterEnd,
    periodSort,
    columnSort,
  ]);

  const onHeaderSort = (key: ColKey) => {
    if (!isSortableCol(key)) return;
    setColumnSort((prev) => cycleColumnSort(prev, key as ColumnSortKey));
  };

  const clearColumnSort = () => {
    setColumnSort(null);
    setPeriodSort("default");
  };

  const taskIds = useMemo(
    () => rows.filter((r) => r.kind === "task").map((r) => r.task.id),
    [rows],
  );
  const calCount = rows.filter((r) => r.kind === "calendar").length;
  const taskCount = rows.filter((r) => r.kind === "task").length;
  const filterActive = Boolean(filterStart || filterEnd);
  const gcalFilterActive = Boolean(gcalRangeStart || gcalRangeEnd);

  const applyChip = (c: "all" | "today" | "week" | "month") => {
    setChip(c);
    if (c === "all") {
      setFilterStart("");
      setFilterEnd("");
      return;
    }
    const t = todayIso();
    if (c === "today") {
      setFilterStart(t);
      setFilterEnd(t);
      return;
    }
    if (c === "week") {
      const w = weekRangeContaining(t);
      setFilterStart(w.start);
      setFilterEnd(w.end);
      return;
    }
    const m = monthRangeContaining(t);
    setFilterStart(m.start);
    setFilterEnd(m.end);
  };

  const clearFilter = () => {
    setChip("all");
    setFilterStart("");
    setFilterEnd("");
  };

  const moveFocus = useCallback(
    (rowId: string, col: ColKey, dir: "next" | "prev" | "down" | "up") => {
      const colIdx = EDITABLE.indexOf(col);
      const rowIdx = taskIds.indexOf(rowId);
      if (rowIdx < 0 || colIdx < 0) return;
      if (dir === "next" || dir === "prev") {
        const n = dir === "next" ? colIdx + 1 : colIdx - 1;
        if (n >= 0 && n < EDITABLE.length) {
          setFocus({ rowId, col: EDITABLE[n] });
          return;
        }
        const nr = dir === "next" ? rowIdx + 1 : rowIdx - 1;
        if (nr >= 0 && nr < taskIds.length) {
          setFocus({
            rowId: taskIds[nr],
            col:
              dir === "next"
                ? EDITABLE[0]
                : EDITABLE[EDITABLE.length - 1],
          });
        }
        return;
      }
      const nr = dir === "down" ? rowIdx + 1 : rowIdx - 1;
      if (nr >= 0 && nr < taskIds.length) {
        setFocus({ rowId: taskIds[nr], col });
      }
    },
    [taskIds],
  );

  useEffect(() => {
    setFocus(null);
    setSelectedRow(null);
  }, [sheet, frame]);

  useEffect(() => {
    if (!focus) return;
    const el = document.querySelector<HTMLElement>(
      `[data-excel-cell="${focus.rowId}:${focus.col}"]`,
    );
    el?.focus();
  }, [focus]);

  const chipClass = (c: typeof chip) =>
    `h-8 rounded-sm px-2.5 text-[13px] font-medium border ${
      chip === c
        ? "border-[#217346] bg-[#217346] text-white"
        : "border-[#8a939a] bg-white text-[#1a2420] hover:bg-[#eef7f1]"
    }`;

  const applyGcalChip = (c: "today" | "week" | "month") => {
    const t = todayIso();
    setGcalChip(c);
    if (c === "today") {
      setGcalRangeStart(t);
      setGcalRangeEnd(t);
      return;
    }
    if (c === "week") {
      const w = weekRangeContaining(t);
      setGcalRangeStart(w.start);
      setGcalRangeEnd(w.end);
      return;
    }
    const m = monthRangeContaining(t);
    setGcalRangeStart(m.start);
    setGcalRangeEnd(m.end);
  };

  const clearGcalFilter = () => {
    setGcalChip("none");
    setGcalRangeStart("");
    setGcalRangeEnd("");
  };

  const gcalChipClass = (c: typeof gcalChip) =>
    `h-8 rounded-sm px-2.5 text-[13px] font-medium border ${
      gcalChip === c
        ? "border-[#3b6ea5] bg-[#3b6ea5] text-white"
        : "border-[#8a939a] bg-white text-[#1a2420] hover:bg-[#eef3fa]"
    }`;

  return (
    <div className="excel-wb flex flex-col overflow-hidden rounded-sm border border-[#7a8288] bg-[#dfe3e6] shadow-[0_2px_10px_rgba(26,43,54,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#9aa5ad] bg-gradient-to-b from-[#f7f8f9] to-[#e4e7ea] px-3 py-2">
        <p className="truncate text-[15px] font-semibold text-[#1a2420]">
          일비서.xlsx
          <span className="ml-2 text-[12px] font-normal text-[#5c655f]">
            — TO DO LIST
          </span>
        </p>
        <p className="text-[13px] tabular-nums text-[#5c655f]">{todayLabel}</p>
      </div>

      {/* Ribbon */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#9aa5ad] bg-[#f0f2f4] px-3 py-2">
        <label className="flex items-center gap-2 text-[13px] text-[#1a2420]">
          <span className="font-semibold">틀</span>
          <select
            value={frame}
            onChange={(e) => onFrameChange(e.target.value as FrameId)}
            className="h-9 min-w-[8.5rem] rounded-sm border border-[#8a939a] bg-white px-2 text-[14px] font-medium outline-none focus:border-[#217346]"
            aria-label="틀"
          >
            {FRAME_ORDER.map((c) => (
              <option key={c} value={c}>
                {FRAME_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        {!isGcal && sheet === "todo" ? (
          <>
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-sm bg-[#217346] px-3 text-white hover:bg-[#1a5c38]"
              onClick={onAdd}
            >
              <Plus className="size-3.5" />
              행 추가
            </Button>
            {isTaskCategory(frame) ? (
              <>
                <MemoImport category={frame} onImport={onImport} />
                <OcrImport category={frame} onImport={onImport} />
              </>
            ) : null}
          </>
        ) : null}
        {isGcal && sheet === "todo" ? (
          <p className="text-[13px] text-[#1a3a6b]">
            구글 캘린더 틀 · 읽기 전용 · ICS/연결은 「캘린더」메뉴
          </p>
        ) : null}
        {!isGcal && sheet === "done" ? (
          <p className="text-[13px] text-[#5c655f]">한 일 · 완료여부 복원 가능</p>
        ) : null}
        {isGcal && sheet === "done" ? (
          <p className="text-[13px] text-[#5c655f]">
            캘린더 일정은 한 일 시트로 옮기지 않습니다.
          </p>
        ) : null}
        {selectedRow && !isGcal ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-sm border-[#b42318]/40 text-[#b42318]"
            onClick={() => onDelete(selectedRow)}
          >
            <Trash2 className="size-3.5" />
            선택 행 삭제
          </Button>
        ) : null}
        {selectedRow && sheet === "done" && !isGcal ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-sm"
            onClick={() => onRestore(selectedRow)}
          >
            <RotateCcw className="size-3.5" />
            복원
          </Button>
        ) : null}
        <span className="ml-auto text-[12px] text-[#5c655f]">
          {FRAME_LABEL[frame]} · {rows.length}행
          {isGcal && calCount > 0 ? ` (캘린더)` : ""}
          {!isGcal && filterActive ? ` · 필터 적용` : ""}
          {isGcal && gcalFilterActive ? ` · 기간 필터` : ""}
          {isGcal && !gcalFilterActive && sheet === "todo"
            ? ` · 오늘부터`
            : ""}
          {columnSort ? ` · ${columnSortLabel(columnSort)}` : ""}
        </span>
      </div>

      {/* Period filter OR Google calendar picker */}
      {isGcal && sheet === "todo" ? (
        <div className="flex flex-col gap-2 border-b border-[#9aa5ad] bg-[#e8ecef] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-[#1a2420]">기간</span>
            <label className="flex items-center gap-1 text-[12px] text-[#5c655f]">
              시작일
              <input
                type="date"
                value={gcalRangeStart}
                onChange={(e) => {
                  setGcalRangeStart(e.target.value);
                  setGcalChip("none");
                }}
                className="h-8 rounded-sm border border-[#8a939a] bg-white px-1.5 text-[13px]"
                aria-label="캘린더 기간 시작일"
              />
            </label>
            <span className="text-[#5c655f]">~</span>
            <label className="flex items-center gap-1 text-[12px] text-[#5c655f]">
              종료일
              <input
                type="date"
                value={gcalRangeEnd}
                onChange={(e) => {
                  setGcalRangeEnd(e.target.value);
                  setGcalChip("none");
                }}
                className="h-8 rounded-sm border border-[#8a939a] bg-white px-1.5 text-[13px]"
                aria-label="캘린더 기간 종료일"
              />
            </label>
            <button
              type="button"
              className={gcalChipClass("today")}
              onClick={() => applyGcalChip("today")}
            >
              오늘
            </button>
            <button
              type="button"
              className={gcalChipClass("week")}
              onClick={() => applyGcalChip("week")}
            >
              이번 주
            </button>
            <button
              type="button"
              className={gcalChipClass("month")}
              onClick={() => applyGcalChip("month")}
            >
              이번 달
            </button>
            {gcalFilterActive ? (
              <button
                type="button"
                onClick={clearGcalFilter}
                className="inline-flex h-8 items-center gap-1 rounded-sm border border-[#8a939a] bg-white px-2 text-[13px] text-[#5c655f]"
              >
                <X className="size-3.5" />
                필터 지우기
              </button>
            ) : null}
            {columnSort ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 min-h-8 gap-1 px-2 text-[12px]"
                onClick={clearColumnSort}
              >
                <RotateCcw className="size-3.5" />
                기본 정렬
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-[#5c655f]">
            시작·종료일을 비우면 오늘 포함 이후 일정만 보입니다. 표 머리글
            「마감목표」를 눌러 오름/내림 · 빈 값은 맨 아래.
            {columnSort ? ` · 지금: ${columnSortLabel(columnSort)}` : ""}
          </p>
        </div>
      ) : !isGcal ? (
      <div className="flex flex-col gap-2 border-b border-[#9aa5ad] bg-[#e8ecef] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-[#1a2420]">기간</span>
          <label className="flex items-center gap-1 text-[12px] text-[#5c655f]">
            시작일
            <input
              type="date"
              value={filterStart}
              onChange={(e) => {
                setFilterStart(e.target.value);
                setChip("all");
              }}
              className="h-8 rounded-sm border border-[#8a939a] bg-white px-1.5 text-[13px]"
              aria-label="기간 시작일"
            />
          </label>
          <span className="text-[#5c655f]">~</span>
          <label className="flex items-center gap-1 text-[12px] text-[#5c655f]">
            종료일
            <input
              type="date"
              value={filterEnd}
              onChange={(e) => {
                setFilterEnd(e.target.value);
                setChip("all");
              }}
              className="h-8 rounded-sm border border-[#8a939a] bg-white px-1.5 text-[13px]"
              aria-label="기간 종료일"
            />
          </label>
          <button type="button" className={chipClass("today")} onClick={() => applyChip("today")}>
            오늘
          </button>
          <button type="button" className={chipClass("week")} onClick={() => applyChip("week")}>
            이번 주
          </button>
          <button type="button" className={chipClass("month")} onClick={() => applyChip("month")}>
            이번 달
          </button>
          <button type="button" className={chipClass("all")} onClick={() => applyChip("all")}>
            전체
          </button>
          {filterActive ? (
            <button
              type="button"
              onClick={clearFilter}
              className="inline-flex h-8 items-center gap-1 rounded-sm border border-[#8a939a] bg-white px-2 text-[13px] text-[#5c655f]"
            >
              <X className="size-3.5" />
              필터 지우기
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-[#1a2420]">정렬</span>
          <select
            value={columnSort ? "column" : periodSort}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "column") return;
              setColumnSort(null);
              setPeriodSort(v as PeriodSort);
            }}
            className="h-8 rounded-sm border border-[#8a939a] bg-white px-2 text-[13px]"
            aria-label="기간 정렬"
          >
            <option value="default">기본(스팟·지속·언젠가)</option>
            <option value="start">시작일 순</option>
            <option value="end">마감(종료)일 순</option>
            {columnSort ? (
              <option value="column">{columnSortLabel(columnSort)}</option>
            ) : null}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 min-h-8 gap-1 px-2 text-[12px]"
            disabled={!columnSort && periodSort === "default"}
            onClick={clearColumnSort}
            title="스팟·지속·언젠가 기본 순서로 되돌림"
          >
            <RotateCcw className="size-3.5" />
            기본 정렬
          </Button>
          <p className="text-[11px] text-[#5c655f]">
            표 머리글(마감목표·중요도·시급성)을 눌러 오름/내림 · 빈 값은 맨 아래
          </p>
        </div>
      </div>
      ) : null}

      <div className="relative max-h-[min(66vh,720px)] min-h-[300px] overflow-auto bg-white">
        <table className="w-full min-w-[820px] border-collapse text-[15px] text-black">
          <thead className="sticky top-0 z-20">
            <tr>
              {COLS.map((c) => {
                const sortable = isSortableCol(c.key);
                const active =
                  sortable && columnSort?.key === c.key ? columnSort : null;
                return (
                  <th
                    key={`H-${c.key}`}
                    style={
                      c.key === "listup"
                        ? { width: c.width, minWidth: "260px" }
                        : { width: c.width, minWidth: c.width }
                    }
                    className={`border border-black bg-[#f3f3f3] px-1 py-2 text-center text-[15px] font-bold leading-tight text-black ${
                      sortable ? "p-0" : "px-2 py-3"
                    }`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onHeaderSort(c.key)}
                        className={`flex min-h-11 w-full items-center justify-center gap-0.5 px-1 py-2 text-[14px] font-bold text-black hover:bg-[#e8efe9] active:bg-[#dce8de] sm:text-[15px] ${
                          active ? "bg-[#e4efe6]" : ""
                        }`}
                        aria-label={`${c.label} 정렬 (${
                          !active
                            ? "기본"
                            : active.dir === "asc"
                              ? "오름차순"
                              : "내림차순"
                        }) · 누르면 바뀜`}
                        title="클릭: 없음 → 오름차순 → 내림차순 → 기본"
                      >
                        <span>{c.label}</span>
                        <span
                          className="inline-flex flex-col leading-none text-[#217346]"
                          aria-hidden
                        >
                          {active?.dir === "asc" ? (
                            <ArrowUp className="size-3.5 stroke-[2.5]" />
                          ) : active?.dir === "desc" ? (
                            <ArrowDown className="size-3.5 stroke-[2.5]" />
                          ) : (
                            <span className="text-[10px] font-semibold text-[#8a939a]">
                              ↕
                            </span>
                          )}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="border border-black px-4 py-16 text-center text-[15px] text-[#555]"
                >
                  {filterActive && !isGcal ? (
                    <p>
                      이 기간에 겹치는 할 일이 없습니다. 「전체」를 누르세요.
                    </p>
                  ) : isGcal && sheet === "todo" ? (
                    <p>
                      이 기간에 일정이 없습니다. ICS·Google을 「캘린더」
                      메뉴에서 불러오거나 기간·오늘/이번 주/이번 달을
                      바꿔 보세요.
                    </p>
                  ) : sheet === "todo" ? (
                    <>
                      <p>할 일이 없습니다. 「행 추가」로 첫 줄을 넣으세요.</p>
                      <button
                        type="button"
                        className="mt-2 text-[14px] font-semibold text-[#217346] underline"
                        onClick={onAdd}
                      >
                        행 추가
                      </button>
                    </>
                  ) : (
                    <p>한 일이 없습니다.</p>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                if (row.kind === "calendar") {
                  const ev = row.event;
                  const order = idx + 1;
                  return (
                    <tr
                      key={row.id}
                      className="bg-[#eef3fa] ring-1 ring-inset ring-[#3b6ea5]/20"
                      aria-label="캘린더 일정 행"
                    >
                      <td className="border border-black px-1 py-1 text-center align-middle text-[14px] font-medium tabular-nums text-[#1a3a6b]">
                        {order}
                      </td>
                      <td className="border border-black border-l-[4px] border-l-[#3b6ea5] px-2 py-2 align-top">
                        <p className="text-[14px] font-semibold leading-snug text-[#1a2420]">
                          {calendarListUpTitle(ev)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#3b6ea5]">
                          {ev.calendarName || "Google/ICS"} · 읽기 전용
                        </p>
                      </td>
                      <td className="border border-black px-1 py-2 text-center align-middle text-[13px] text-[#1a2420]">
                        {formatEventDeadline(ev)}
                      </td>
                      <td className="border border-black px-1 py-2 text-center align-middle text-[#888]">
                        —
                      </td>
                      <td className="border border-black px-1 py-2 text-center align-middle text-[#888]">
                        —
                      </td>
                      <td
                        className="border border-black px-1 py-2 text-center align-middle text-[12px] text-[#5c655f]"
                        title="캘린더 일정은 완료 체크 불가"
                      >
                        —
                      </td>
                    </tr>
                  );
                }

                const task = row.task;
                const order = idx + 1;
                const selected = selectedRow === task.id;
                const zebra = order % 2 === 0;
                const deadlineFocused =
                  focus?.rowId === task.id && focus.col === "deadline";
                return (
                  <tr
                    key={task.id}
                    onClick={() => setSelectedRow(task.id)}
                    className={
                      selected
                        ? "bg-[#e8f5ee]"
                        : zebra
                          ? "bg-[#fafafa]"
                          : "bg-white"
                    }
                  >
                    <td className="border border-black px-1 py-1 text-center align-middle text-[14px] font-medium tabular-nums">
                      {order}
                    </td>

                    <EditCell
                      active={focus?.rowId === task.id && focus.col === "listup"}
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "listup" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "listup", moveFocus)
                      }
                    >
                      <div className="flex w-full flex-col gap-0.5 px-1.5 py-1.5">
                        <textarea
                          data-excel-cell={`${task.id}:listup`}
                          value={task.title}
                          rows={Math.min(
                            5,
                            Math.max(1, Math.ceil(task.title.length / 36)),
                          )}
                          onChange={(e) =>
                            onUpdate(task.id, { title: e.target.value })
                          }
                          className="excel-textarea font-medium"
                          aria-label="할일 LIST UP"
                        />
                        {task.memo || focus?.rowId === task.id ? (
                          <input
                            value={task.memo}
                            placeholder="메모"
                            onChange={(e) =>
                              onUpdate(task.id, { memo: e.target.value })
                            }
                            className="excel-input min-h-0 py-0.5 text-[12px] text-[#555]"
                            aria-label="메모"
                          />
                        ) : null}
                      </div>
                    </EditCell>

                    {/* 마감목표: 시작일 ~ 종료일 */}
                    <EditCell
                      active={deadlineFocused}
                      center
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "deadline" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "deadline", moveFocus)
                      }
                    >
                      {deadlineFocused ? (
                        <div className="flex w-full flex-col gap-1 px-1.5 py-1.5">
                          <label className="flex flex-col items-stretch gap-0.5 text-[10px] text-[#5c655f]">
                            시작일
                            <input
                              data-excel-cell={`${task.id}:deadline`}
                              type="date"
                              value={task.startDate ?? ""}
                              onChange={(e) =>
                                onUpdate(task.id, {
                                  startDate: e.target.value || null,
                                })
                              }
                              className="excel-input min-h-8 text-center text-[13px]"
                              aria-label="시작일"
                            />
                          </label>
                          <label className="flex flex-col items-stretch gap-0.5 text-[10px] text-[#5c655f]">
                            종료일
                            <input
                              type="date"
                              value={task.targetDate ?? ""}
                              onChange={(e) =>
                                onUpdate(task.id, {
                                  targetDate: e.target.value || null,
                                })
                              }
                              className="excel-input min-h-8 text-center text-[13px]"
                              aria-label="종료일"
                            />
                          </label>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="min-h-11 w-full px-1 text-center text-[13px] leading-snug"
                          onClick={() => {
                            setSelectedRow(task.id);
                            setFocus({ rowId: task.id, col: "deadline" });
                          }}
                          aria-label="마감목표"
                        >
                          {formatDeadlineRange(task) || (
                            <span className="text-[#999]">시작 ~ 종료</span>
                          )}
                        </button>
                      )}
                    </EditCell>

                    <EditCell
                      active={
                        focus?.rowId === task.id && focus.col === "importance"
                      }
                      center
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "importance" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "importance", moveFocus)
                      }
                    >
                      <ScoreSelect
                        cellId={`${task.id}:importance`}
                        value={task.importance}
                        onChange={(n) =>
                          onUpdate(task.id, { importance: n })
                        }
                        label="중요도"
                      />
                    </EditCell>

                    <EditCell
                      active={
                        focus?.rowId === task.id && focus.col === "urgency"
                      }
                      center
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "urgency" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "urgency", moveFocus)
                      }
                    >
                      <ScoreSelect
                        cellId={`${task.id}:urgency`}
                        value={task.urgency}
                        onChange={(n) => onUpdate(task.id, { urgency: n })}
                        label="시급성"
                      />
                    </EditCell>

                    <td className="border border-black px-1 py-1 text-center align-middle">
                      {sheet === "todo" ? (
                        <input
                          type="checkbox"
                          className="size-[18px] accent-[#217346]"
                          aria-label={`${task.title} 완료여부`}
                          onChange={() => onComplete(task.id)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-[#217346]"
                          onClick={() => onRestore(task.id)}
                          title="클릭하면 할 일로 복원"
                        >
                          <input
                            type="checkbox"
                            checked
                            readOnly
                            className="size-[16px] accent-[#217346]"
                            tabIndex={-1}
                          />
                          완료
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col border-t border-[#7a8288] bg-[#f0f2f4]">
        <div className="border-b border-[#c5ccd2] px-3 py-1 text-[11px] text-[#5c655f]">
          {isGcal
            ? "구글 캘린더 틀 · [캘린더] 행만 · 읽기 전용 · 기간으로 필터"
            : "프로그램 할 일만 (틀별) · 캘린더는 「구글 캘린더」 틀에서"}
        </div>
        <div className="flex items-end gap-0 overflow-x-auto px-1 pt-1">
          <SheetTab
            active={sheet === "todo"}
            onClick={() => onSheetChange("todo")}
          >
            할 일
          </SheetTab>
          <SheetTab
            active={sheet === "done"}
            onClick={() => onSheetChange("done")}
          >
            한 일
          </SheetTab>
          <span className="mb-1.5 ml-2 hidden text-[11px] text-[#8a939a] sm:inline">
            틀에 「구글 캘린더」 · ICS는 캘린더 메뉴
          </span>
        </div>
      </div>
    </div>
  );
}

function SheetTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-w-[4.5rem] rounded-t-md border border-b-0 px-4 py-2 text-[13px] font-semibold transition-colors ${
        active
          ? "z-10 -mb-px border-[#7a8288] bg-white text-[#217346]"
          : "border-transparent bg-[#cfd4d8] text-[#5c655f] hover:bg-[#e9ecef]"
      }`}
    >
      {children}
    </button>
  );
}

function EditCell({
  children,
  active,
  center,
  onFocusCell,
  onKeyNav,
}: {
  children: ReactNode;
  active?: boolean;
  center?: boolean;
  onFocusCell: () => void;
  onKeyNav: (e: KeyboardEvent) => void;
}) {
  return (
    <td
      className={`border border-black p-0 align-middle ${
        active
          ? "bg-[#eef7f1] outline outline-2 outline-[#217346] outline-offset-[-2px]"
          : ""
      } ${center ? "text-center" : ""}`}
      onClick={onFocusCell}
      onKeyDown={onKeyNav}
    >
      <div
        className={`flex min-h-11 items-stretch ${center ? "justify-center" : ""}`}
      >
        {children}
      </div>
    </td>
  );
}

function ScoreSelect({
  value,
  onChange,
  label,
  cellId,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  cellId?: string;
}) {
  const safe = Math.min(3, Math.max(1, Number(value) || 1));
  return (
    <select
      data-excel-cell={cellId}
      value={safe}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="excel-input text-center"
    >
      {[1, 2, 3].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

function handleNav(
  e: KeyboardEvent,
  rowId: string,
  col: ColKey,
  move: (
    rowId: string,
    col: ColKey,
    dir: "next" | "prev" | "down" | "up",
  ) => void,
) {
  if (e.key === "Tab") {
    e.preventDefault();
    move(rowId, col, e.shiftKey ? "prev" : "next");
  } else if (
    e.key === "Enter" &&
    (e.target as HTMLElement).tagName !== "TEXTAREA"
  ) {
    e.preventDefault();
    move(rowId, col, e.shiftKey ? "up" : "down");
  }
}
