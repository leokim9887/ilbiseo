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
  type GcalViewMode,
} from "@/lib/sheet-rows";
import {
  formatDeadlineRange,
  monthRangeContaining,
  todayIso,
  weekRangeContaining,
  type PeriodSort,
} from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { MemoImport } from "@/components/memo-import";
import { OcrImport } from "@/components/ocr-import";
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2, X } from "lucide-react";

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
  const [chip, setChip] = useState<"all" | "today" | "week" | "month">("all");
  /** Google Calendar 틀: selected day (이날만) */
  const [gcalDay, setGcalDay] = useState(todayIso());
  /** todayForward = 오늘부터 (default) · day = 이날만 · range = 기간 입력/칩 */
  const [gcalMode, setGcalMode] = useState<GcalViewMode>("todayForward");
  const [gcalRangeStart, setGcalRangeStart] = useState("");
  const [gcalRangeEnd, setGcalRangeEnd] = useState("");
  const [gcalChip, setGcalChip] = useState<
    "none" | "today" | "week" | "month"
  >("none");
  const [pickerMonth, setPickerMonth] = useState(() => todayIso().slice(0, 7));
  const [pickerYear, setPickerYear] = useState(() =>
    new Date().getFullYear(),
  );
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
    if (isGcal && sheet === "todo") {
      return buildGcalFrameRows(calendarEvents, {
        mode: gcalMode,
        selectedDay: gcalDay,
        rangeStart: gcalRangeStart || null,
        rangeEnd: gcalRangeEnd || null,
      });
    }
    if (isGcal && sheet === "done") {
      return [];
    }
    return buildTaskOnlyRows(baseTasks, {
      filterStart: filterStart || null,
      filterEnd: filterEnd || null,
      periodSort,
    });
  }, [
    isGcal,
    sheet,
    calendarEvents,
    gcalDay,
    gcalMode,
    gcalRangeStart,
    gcalRangeEnd,
    baseTasks,
    filterStart,
    filterEnd,
    periodSort,
  ]);

  const taskIds = useMemo(
    () => rows.filter((r) => r.kind === "task").map((r) => r.task.id),
    [rows],
  );
  const calCount = rows.filter((r) => r.kind === "calendar").length;
  const taskCount = rows.filter((r) => r.kind === "task").length;
  const filterActive = Boolean(filterStart || filterEnd);

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

  const shiftPickerMonth = (delta: number) => {
    const [y, m] = pickerMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    setPickerYear(yy);
    setPickerMonth(`${yy}-${mm}`);
  };

  const setPickerYearAndKeepMonth = (year: number) => {
    const m = pickerMonth.split("-")[1] || "01";
    setPickerYear(year);
    setPickerMonth(`${year}-${m}`);
  };

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const years: number[] = [];
    for (let y = now - 15; y <= now + 5; y++) years.push(y);
    if (!years.includes(pickerYear)) years.push(pickerYear);
    return years.sort((a, b) => a - b);
  }, [pickerYear]);

  const applyGcalChip = (c: "today" | "week" | "month") => {
    const t = todayIso();
    setGcalChip(c);
    setGcalMode("range");
    if (c === "today") {
      setGcalRangeStart(t);
      setGcalRangeEnd(t);
      setGcalDay(t);
      setPickerMonth(t.slice(0, 7));
      setPickerYear(Number(t.slice(0, 4)));
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

  const gcalChipClass = (c: typeof gcalChip) =>
    `h-8 rounded-sm px-2.5 text-[13px] font-medium border ${
      gcalChip === c
        ? "border-[#3b6ea5] bg-[#3b6ea5] text-white"
        : "border-[#8a939a] bg-white text-[#1a2420] hover:bg-[#eef3fa]"
    }`;

  const modeClass = (active: boolean) =>
    `h-8 rounded-sm border px-2.5 text-[13px] font-medium ${
      active
        ? "border-[#3b6ea5] bg-[#3b6ea5] text-white"
        : "border-[#8a939a] bg-white text-[#1a2420] hover:bg-[#eef3fa]"
    }`;

  const pickerCells = useMemo(() => {
    const [y, m] = pickerMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = (first.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: Array<{ day: number | null; iso: string | null }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ day: null, iso: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, iso });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });
    return cells;
  }, [pickerMonth]);

  const monthNum = Number(pickerMonth.split("-")[1] || 1);

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
        </span>
      </div>

      {/* Period filter OR Google calendar picker */}
      {isGcal && sheet === "todo" ? (
        <div className="flex flex-col gap-3 border-b border-[#9aa5ad] bg-[#e8ecef] px-3 py-3">
          {/* Period bar like task filter */}
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
                  setGcalMode("range");
                  if (e.target.value) {
                    setGcalDay(e.target.value);
                    setPickerMonth(e.target.value.slice(0, 7));
                    setPickerYear(Number(e.target.value.slice(0, 4)));
                  }
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
                  setGcalMode("range");
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
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {/* Mini calendar with year jump */}
            <div className="min-w-[260px] rounded-sm border border-[#8a939a] bg-white p-2 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                <button
                  type="button"
                  className="rounded px-1.5 py-1 text-[12px] font-semibold text-[#3b6ea5] hover:bg-[#eef3fa]"
                  aria-label="이전 해"
                  onClick={() => setPickerYearAndKeepMonth(pickerYear - 1)}
                >
                  ≪
                </button>
                <button
                  type="button"
                  className="rounded p-1 hover:bg-[#eef3fa]"
                  aria-label="이전 달"
                  onClick={() => shiftPickerMonth(-1)}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div className="flex items-center gap-1">
                  <select
                    aria-label="연도 선택"
                    className="h-8 rounded-sm border border-[#8a939a] bg-white px-1 text-[13px] font-semibold"
                    value={pickerYear}
                    onChange={(e) =>
                      setPickerYearAndKeepMonth(Number(e.target.value))
                    }
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}년
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="월 선택"
                    className="h-8 rounded-sm border border-[#8a939a] bg-white px-1 text-[13px] font-semibold"
                    value={monthNum}
                    onChange={(e) => {
                      const mm = String(Number(e.target.value)).padStart(2, "0");
                      setPickerMonth(`${pickerYear}-${mm}`);
                    }}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {m}월
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="rounded p-1 hover:bg-[#eef3fa]"
                  aria-label="다음 달"
                  onClick={() => shiftPickerMonth(1)}
                >
                  <ChevronRight className="size-4" />
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 py-1 text-[12px] font-semibold text-[#3b6ea5] hover:bg-[#eef3fa]"
                  aria-label="다음 해"
                  onClick={() => setPickerYearAndKeepMonth(pickerYear + 1)}
                >
                  ≫
                </button>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] text-[#5c655f]">
                {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div
                className="grid grid-cols-7 gap-0.5"
                role="grid"
                aria-label="날짜 선택 달력"
              >
                {pickerCells.map((c, i) =>
                  c.iso ? (
                    <button
                      key={c.iso}
                      type="button"
                      role="gridcell"
                      aria-selected={gcalDay === c.iso}
                      onClick={() => {
                        setGcalDay(c.iso!);
                        setPickerMonth(c.iso!.slice(0, 7));
                        setPickerYear(Number(c.iso!.slice(0, 4)));
                        setGcalMode("day");
                        setGcalChip("none");
                        setGcalRangeStart(c.iso!);
                        setGcalRangeEnd(c.iso!);
                      }}
                      className={`h-8 rounded text-[13px] tabular-nums ${
                        gcalDay === c.iso
                          ? "bg-[#3b6ea5] font-semibold text-white"
                          : c.iso === todayIso()
                            ? "bg-[#eef3fa] font-medium text-[#1a3a6b]"
                            : "text-[#1a2420] hover:bg-[#f0f4f8]"
                      }`}
                    >
                      {c.day}
                    </button>
                  ) : (
                    <span key={`e-${i}`} className="h-8" />
                  ),
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {(gcalMode === "day" || gcalDay) && (
                <p className="text-[13px] font-semibold text-[#1a2420]">
                  선택한 날:{" "}
                  <span className="tabular-nums text-[#3b6ea5]">{gcalDay}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={modeClass(gcalMode === "todayForward")}
                  onClick={() => {
                    const t = todayIso();
                    setGcalMode("todayForward");
                    setGcalDay(t);
                    setGcalRangeStart("");
                    setGcalRangeEnd("");
                    setGcalChip("none");
                    setPickerMonth(t.slice(0, 7));
                    setPickerYear(Number(t.slice(0, 4)));
                  }}
                >
                  오늘부터
                </button>
                <button
                  type="button"
                  className={modeClass(gcalMode === "day")}
                  onClick={() => {
                    setGcalMode("day");
                    setGcalChip("none");
                    setGcalRangeStart(gcalDay);
                    setGcalRangeEnd(gcalDay);
                  }}
                >
                  이날만
                </button>
              </div>
              <p className="text-[11px] text-[#5c655f]">
                기본은 「오늘부터」입니다. 기간·오늘/이번 주/이번 달로 구간을
                고르거나, 달력에서 날을 고른 뒤 「이날만」을 쓰세요. 연도는
                드롭다운·≪ ≫로 바로 바꿀 수 있습니다.
              </p>
            </div>
          </div>
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
            value={periodSort}
            onChange={(e) => setPeriodSort(e.target.value as PeriodSort)}
            className="h-8 rounded-sm border border-[#8a939a] bg-white px-2 text-[13px]"
            aria-label="기간 정렬"
          >
            <option value="default">기본(스팟·지속·언젠가)</option>
            <option value="start">시작일 순</option>
            <option value="end">마감(종료)일 순</option>
          </select>
          <p className="text-[11px] text-[#5c655f]">
            이 틀의 할 일만 표시 · 날짜 없는 행은 「전체」에서만
          </p>
        </div>
      </div>
      ) : null}

      <div className="relative max-h-[min(66vh,720px)] min-h-[300px] overflow-auto bg-white">
        <table className="w-full min-w-[820px] border-collapse text-[15px] text-black">
          <thead className="sticky top-0 z-20">
            <tr>
              {COLS.map((c) => (
                <th
                  key={`H-${c.key}`}
                  style={
                    c.key === "listup"
                      ? { width: c.width, minWidth: "260px" }
                      : { width: c.width, minWidth: c.width }
                  }
                  className="border border-black bg-[#f3f3f3] px-2 py-3 text-center text-[15px] font-bold leading-tight text-black"
                >
                  {c.label}
                </th>
              ))}
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
                      이 날짜 조건에 일정이 없습니다. ICS·Google을 「캘린더」
                      메뉴에서 불러오거나 달력에서 다른 날을 고르세요.
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
            ? "구글 캘린더 틀 · [캘린더] 행만 · 읽기 전용 · 달력으로 날짜 선택"
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
