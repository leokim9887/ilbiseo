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
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type CalendarEvent,
  type Task,
  type TaskCategory,
} from "@/lib/types";
import {
  buildTodoSheetRows,
  calendarListUpTitle,
  formatEventDeadline,
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
import { Plus, RotateCcw, Trash2, X } from "lucide-react";

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
  category: TaskCategory;
  onCategoryChange: (c: TaskCategory) => void;
  activeTasks: Task[];
  doneTasks: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onImport: (tasks: Task[]) => void;
  /** 할 일 시트에만 ICS/OAuth 일정 행으로 합침 (읽기 전용) */
  calendarEvents?: CalendarEvent[];
}

export function ExcelWorkbook({
  sheet,
  onSheetChange,
  category,
  onCategoryChange,
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
  const [focus, setFocus] = useState<FocusCell | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [filterStart, setFilterStart] = useState<string>("");
  const [filterEnd, setFilterEnd] = useState<string>("");
  const [periodSort, setPeriodSort] = useState<PeriodSort>("default");
  const [chip, setChip] = useState<"all" | "today" | "week" | "month">("all");

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

  const rows = useMemo(
    () =>
      buildTodoSheetRows(baseTasks, calendarEvents, {
        filterStart: filterStart || null,
        filterEnd: filterEnd || null,
        periodSort,
        includeCalendar: sheet === "todo",
      }),
    [
      baseTasks,
      calendarEvents,
      filterStart,
      filterEnd,
      periodSort,
      sheet,
    ],
  );

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
  }, [sheet, category]);

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
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as TaskCategory)}
            className="h-9 min-w-[7.5rem] rounded-sm border border-[#8a939a] bg-white px-2 text-[14px] font-medium outline-none focus:border-[#217346]"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        {sheet === "todo" ? (
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
            <MemoImport category={category} onImport={onImport} />
            <OcrImport category={category} onImport={onImport} />
          </>
        ) : (
          <p className="text-[13px] text-[#5c655f]">한 일 · 완료여부 복원 가능</p>
        )}
        {selectedRow ? (
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
        {selectedRow && sheet === "done" ? (
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
          {CATEGORY_LABEL[category]} · {rows.length}행
          {sheet === "todo" && calCount > 0
            ? ` (할 일 ${taskCount} · 캘린더 ${calCount})`
            : ""}
          {filterActive ? ` · 필터 적용` : ""}
        </span>
      </div>

      {/* Period filter bar */}
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
            할 일·캘린더 행 모두 기간 겹침 기준 · 날짜 없는 할 일은 「전체」에서만
          </p>
        </div>
      </div>

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
                  {filterActive ? (
                    <p>
                      이 기간에 겹치는 할 일·캘린더 행이 없습니다. 「전체」를
                      누르거나 캘린더를 불러오세요.
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
          할 일(편집) + [캘린더] 행(파랑·읽기 전용) · 기간 필터는 둘 다 적용
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
            캘린더 불러오기는 「캘린더」메뉴 · 일정은 할 일 표에 합쳐짐
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
