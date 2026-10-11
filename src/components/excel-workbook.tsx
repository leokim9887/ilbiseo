"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  isPastUnfinishedTask,
  isSomedayDeadline,
  monthRangeContaining,
  todayIso,
  todayIsoKst,
  weekRangeContaining,
} from "@/lib/date-range";
import {
  buildSimilarityAlertMessage,
  findSimilarActiveTasks,
  taskWordingBlob,
} from "@/lib/text-similarity";
import {
  applyColumnSort,
  columnSortLabel,
  cycleColumnSort,
  isSortableCol,
  type ColumnSort,
  type ColumnSortKey,
} from "@/lib/column-sort";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AutoGrowTextarea } from "@/components/auto-grow-textarea";
import { MemoImport } from "@/components/memo-import";
import { OcrImport } from "@/components/ocr-import";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

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
  frame: FrameId;
  onFrameChange: (f: FrameId) => void;
  /** Tasks for the selected program frame (ignored when frame=gcal) */
  activeTasks: Task[];
  doneTasks: Task[];
  /** All-frame active tasks — for title/memo similarity warn */
  allActiveTasks?: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onCompleteMany?: (ids: string[]) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onRestoreMany?: (ids: string[]) => void;
  onAdd: () => void;
  onImport: (tasks: Task[]) => void;
  calendarEvents?: CalendarEvent[];
}

export function ExcelWorkbook({
  sheet,
  frame,
  onFrameChange,
  activeTasks,
  doneTasks,
  allActiveTasks,
  onUpdate,
  onComplete,
  onCompleteMany,
  onRestore,
  onDelete: _onDelete,
  onDeleteMany,
  onRestoreMany,
  onAdd,
  onImport,
  calendarEvents = [],
}: ExcelWorkbookProps) {
  const isGcal = frame === "gcal";
  const [focus, setFocus] = useState<FocusCell | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Keep active row highlight for keyboard/editing (separate from multi-select)
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [filterStart, setFilterStart] = useState<string>("");
  const [filterEnd, setFilterEnd] = useState<string>("");
  /** Excel header column sort (click 마감목표·중요도·시급성) */
  const [columnSort, setColumnSort] = useState<ColumnSort | null>(null);
  const [chip, setChip] = useState<"all" | "today" | "week" | "month">("all");
  const [gcalRangeStart, setGcalRangeStart] = useState("");
  const [gcalRangeEnd, setGcalRangeEnd] = useState("");
  const [gcalChip, setGcalChip] = useState<
    "none" | "today" | "week" | "month" | "all"
  >("none");
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const paintRef = useRef<{
    active: boolean;
    mode: "add" | "remove";
  }>({ active: false, mode: "add" });
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    [],
  );
  const todayKst = useMemo(() => todayIsoKst(), []);
  const similarityPeers = allActiveTasks ?? activeTasks;
  const [similarityAlert, setSimilarityAlert] = useState<string | null>(null);
  const similarityAckRef = useRef<Set<string>>(new Set());
  const similarityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseTasks = sheet === "todo" ? activeTasks : doneTasks;
  const taskById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of baseTasks) m.set(t.id, t);
    return m;
  }, [baseTasks]);

  const rows = useMemo(() => {
    let built: SheetRow[];
    if (isGcal && sheet === "todo") {
      built = buildGcalFrameRows(calendarEvents, {
        rangeStart: gcalRangeStart || null,
        rangeEnd: gcalRangeEnd || null,
        showAll: gcalChip === "all",
      });
    } else if (isGcal && sheet === "done") {
      built = [];
    } else {
      built = buildTaskOnlyRows(baseTasks, {
        filterStart: filterStart || null,
        filterEnd: filterEnd || null,
        periodSort: "default",
      });
    }
    return applyColumnSort(built, columnSort);
  }, [
    isGcal,
    sheet,
    calendarEvents,
    gcalRangeStart,
    gcalRangeEnd,
    gcalChip,
    baseTasks,
    filterStart,
    filterEnd,
    columnSort,
  ]);

  const onHeaderSort = (key: ColKey) => {
    if (!isSortableCol(key)) return;
    setColumnSort((prev) => cycleColumnSort(prev, key as ColumnSortKey));
  };

  const taskIds = useMemo(
    () => rows.filter((r) => r.kind === "task").map((r) => r.task.id),
    [rows],
  );
  const calCount = rows.filter((r) => r.kind === "calendar").length;
  const taskCount = rows.filter((r) => r.kind === "task").length;
  const filterActive = Boolean(filterStart || filterEnd);
  const gcalFilterActive = Boolean(gcalRangeStart || gcalRangeEnd);

  const selectedCount = selectedIds.size;
  const selectedDeletableIds = useMemo(() => {
    if (sheet !== "todo") return Array.from(selectedIds);
    return Array.from(selectedIds).filter((id) => {
      const t = taskById.get(id);
      return t ? !isPastUnfinishedTask(t, todayKst) : false;
    });
  }, [selectedIds, sheet, taskById, todayKst]);
  const allVisibleSelected =
    taskIds.length > 0 && taskIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = taskIds.some((id) => selectedIds.has(id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setSelectPaint = useCallback((id: string, mode: "add" | "remove") => {
    setSelectedIds((prev) => {
      const has = prev.has(id);
      if (mode === "add" && has) return prev;
      if (mode === "remove" && !has) return prev;
      const next = new Set(prev);
      if (mode === "add") next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const beginPaintSelect = useCallback(
    (id: string, currentlyChecked: boolean) => {
      const mode: "add" | "remove" = currentlyChecked ? "remove" : "add";
      paintRef.current = { active: true, mode };
      setSelectPaint(id, mode);
    },
    [setSelectPaint],
  );

  const paintEnterRow = useCallback(
    (id: string) => {
      if (!paintRef.current.active) return;
      setSelectPaint(id, paintRef.current.mode);
    },
    [setSelectPaint],
  );

  useEffect(() => {
    const endPaint = () => {
      paintRef.current.active = false;
    };
    const onMove = (e: MouseEvent) => {
      if (!paintRef.current.active) return;
      const scroller = tableScrollRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const edge = 36;
      if (e.clientY < rect.top + edge) {
        scroller.scrollTop -= 18;
      } else if (e.clientY > rect.bottom - edge) {
        scroller.scrollTop += 18;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest?.("[data-excel-select-cell]") as
        | HTMLElement
        | null
        | undefined;
      const id = cell?.dataset?.excelSelectCell;
      if (id) setSelectPaint(id, paintRef.current.mode);
    };
    window.addEventListener("mouseup", endPaint);
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mouseup", endPaint);
      window.removeEventListener("mousemove", onMove);
    };
  }, [setSelectPaint]);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(taskIds));
  }, [taskIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    if (allVisibleSelected) clearSelection();
    else selectAllVisible();
  }, [allVisibleSelected, clearSelection, selectAllVisible]);

  /** Deadline edits — no date-range overlap warn (replaced by wording alert). */
  const applyDeadlinePatch = useCallback(
    (task: Task, patch: Partial<Task>) => {
      onUpdate(task.id, patch);
    },
    [onUpdate],
  );

  const maybeWarnSimilarWording = useCallback(
    (task: Task, patch: Partial<Pick<Task, "title" | "memo">>) => {
      const candidate = {
        title: patch.title !== undefined ? patch.title : task.title,
        memo: patch.memo !== undefined ? patch.memo : task.memo,
      };
      const blob = taskWordingBlob(candidate);
      if (!blob) return;
      const hits = findSimilarActiveTasks(candidate, similarityPeers, task.id);
      if (hits.length === 0) return;
      const fingerprint = `${task.id}|${blob}|${hits.map((h) => h.task.id).join(",")}`;
      if (similarityAckRef.current.has(fingerprint)) return;
      const msg = buildSimilarityAlertMessage(hits);
      if (!msg) return;
      similarityAckRef.current.add(fingerprint);
      setSimilarityAlert(msg);
    },
    [similarityPeers],
  );

  const scheduleSimilarityCheck = useCallback(
    (task: Task, patch: Partial<Pick<Task, "title" | "memo">>) => {
      if (similarityTimerRef.current) clearTimeout(similarityTimerRef.current);
      similarityTimerRef.current = setTimeout(() => {
        maybeWarnSimilarWording(task, patch);
      }, 700);
    },
    [maybeWarnSimilarWording],
  );

  useEffect(() => {
    return () => {
      if (similarityTimerRef.current) clearTimeout(similarityTimerRef.current);
    };
  }, []);

  const updateListUp = useCallback(
    (task: Task, patch: Partial<Pick<Task, "title" | "memo">>) => {
      onUpdate(task.id, patch);
      scheduleSimilarityCheck(task, patch);
    },
    [onUpdate, scheduleSimilarityCheck],
  );

  const bulkDelete = useCallback(() => {
    const ids = selectedDeletableIds;
    if (ids.length === 0) return;
    onDeleteMany(ids);
    setSelectedIds(new Set());
    setActiveRow(null);
  }, [onDeleteMany, selectedDeletableIds]);

  const bulkComplete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (onCompleteMany) onCompleteMany(ids);
    else ids.forEach((id) => onComplete(id));
    setSelectedIds(new Set());
    setActiveRow(null);
  }, [onComplete, onCompleteMany, selectedIds]);

  const bulkRestore = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (onRestoreMany) onRestoreMany(ids);
    else ids.forEach((id) => onRestore(id));
    setSelectedIds(new Set());
    setActiveRow(null);
  }, [onRestore, onRestoreMany, selectedIds]);

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
    setActiveRow(null);
    setSelectedIds(new Set());
  }, [sheet, frame]);

  // Drop selection ids that are no longer in the workbook tasks
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(baseTasks.map((t) => t.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [baseTasks]);

  useEffect(() => {
    if (!focus) return;
    // Don't steal focus from the memo sub-input inside LIST UP
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.dataset.excelMemo === focus.rowId
    ) {
      return;
    }
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

  const applyGcalChip = (c: "today" | "week" | "month" | "all") => {
    setGcalChip(c);
    if (c === "all") {
      setGcalRangeStart("");
      setGcalRangeEnd("");
      return;
    }
    const t = todayIso();
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
            {FRAME_ORDER.filter((c) => sheet === "todo" || c !== "gcal").map(
              (c) => (
                <option key={c} value={c}>
                  {FRAME_LABEL[c]}
                </option>
              ),
            )}
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
        {!isGcal && selectedCount > 0 ? (
          <>
            {sheet === "todo" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-sm border-[#217346]/50 text-[#217346]"
                onClick={bulkComplete}
                data-excel-bulk-complete
              >
                <Check className="size-3.5" />
                완료
              </Button>
            ) : null}
            {selectedDeletableIds.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-sm border-[#b42318]/40 text-[#b42318]"
                onClick={bulkDelete}
                data-excel-bulk-delete
              >
                <Trash2 className="size-3.5" />
                선택 삭제
              </Button>
            ) : null}
            {sheet === "done" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-sm"
                onClick={bulkRestore}
                data-excel-bulk-restore
              >
                <RotateCcw className="size-3.5" />
                선택 복원
              </Button>
            ) : null}
          </>
        ) : null}
        <span className="ml-auto text-[12px] text-[#5c655f]">
          {FRAME_LABEL[frame]} · {rows.length}행
          {isGcal && calCount > 0 ? ` (캘린더)` : ""}
          {!isGcal && filterActive ? ` · 필터 적용` : ""}
          {isGcal && sheet === "todo"
            ? gcalFilterActive
              ? ` · 기간 필터`
              : gcalChip === "all"
                ? ` · 전체`
                : ` · 오늘부터`
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
            <button
              type="button"
              className={gcalChipClass("all")}
              onClick={() => applyGcalChip("all")}
            >
              전체
            </button>
            {gcalFilterActive || gcalChip === "all" ? (
              <button
                type="button"
                onClick={clearGcalFilter}
                className="inline-flex h-8 items-center gap-1 rounded-sm border border-[#8a939a] bg-white px-2 text-[13px] text-[#5c655f]"
              >
                <X className="size-3.5" />
                필터 지우기
              </button>
            ) : null}
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
      </div>
      ) : null}

      <div
        ref={tableScrollRef}
        className="relative max-h-[min(66vh,720px)] min-h-[300px] overflow-auto bg-white"
        data-excel-scroll
      >
        <table className="w-full min-w-[860px] border-collapse text-[15px] text-black">
          <thead className="sticky top-0 z-20">
            <tr>
              {!isGcal ? (
                <th
                  className="border border-black bg-[#f3f3f3] px-1 py-2 text-center"
                  style={{ width: "40px", minWidth: "40px" }}
                  title="여러 행 선택"
                >
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          someVisibleSelected && !allVisibleSelected;
                    }}
                    onChange={toggleSelectAllVisible}
                    disabled={taskIds.length === 0}
                    className="size-4 accent-[#217346]"
                    aria-label="보이는 할 일 모두 선택"
                    data-excel-header-select
                  />
                </th>
              ) : null}
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
                  colSpan={isGcal ? 6 : 7}
                  className="border border-black px-4 py-16 text-center text-[15px] text-[#555]"
                >
                  {filterActive && !isGcal ? (
                    <p>
                      이 기간에 겹치는 할 일이 없습니다. 「전체」를 누르세요.
                    </p>
                  ) : isGcal && sheet === "todo" ? (
                    <p>
                      {gcalChip === "all"
                        ? "일정이 없습니다."
                        : "이 기간에 일정이 없습니다. 「전체」를 누르면 가져온 일정을 모두 봅니다."}
                    </p>
                  ) : sheet === "todo" ? (
                    <p>할 일이 없습니다.</p>
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
                        {ev.calendarName ? (
                          <p className="mt-0.5 text-[11px] text-[#3b6ea5]">
                            {ev.calendarName}
                          </p>
                        ) : null}
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
                const checked = selectedIds.has(task.id);
                const active = activeRow === task.id || checked;
                const zebra = order % 2 === 0;
                const overdue =
                  sheet === "todo" && isPastUnfinishedTask(task, todayKst);
                const someday = isSomedayDeadline(task);
                const deadlineFocused =
                  !overdue &&
                  focus?.rowId === task.id &&
                  focus.col === "deadline";
                const startMin = todayKst;
                const endMin =
                  task.startDate && task.startDate >= todayKst
                    ? task.startDate
                    : todayKst;
                const setSomeday = (on: boolean) => {
                  if (on) {
                    onUpdate(task.id, {
                      kind: "someday",
                      startDate: null,
                      targetDate: null,
                    });
                  } else {
                    applyDeadlinePatch(task, {
                      kind: "spot",
                      startDate: todayKst,
                      targetDate: todayKst,
                    });
                  }
                };
                return (
                  <tr
                    key={task.id}
                    onClick={() => setActiveRow(task.id)}
                    data-excel-row={task.id}
                    data-excel-row-selected={checked ? "1" : "0"}
                    data-excel-overdue={overdue ? "1" : "0"}
                    className={
                      overdue
                        ? checked
                          ? "bg-[#f3e6d8]"
                          : "bg-[#faf0e6]"
                        : checked
                          ? "bg-[#dcefe3]"
                          : active
                            ? "bg-[#e8f5ee]"
                            : zebra
                              ? "bg-[#fafafa]"
                              : "bg-white"
                    }
                  >
                    <td
                      className="border border-black px-1 py-0.5 text-center align-middle select-none"
                      data-excel-select-cell={task.id}
                      title="클릭하거나 드래그해서 여러 행 선택"
                      onMouseDown={(e) => {
                        // Paint-select from checkbox column only — never steal text edits
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        beginPaintSelect(task.id, checked);
                      }}
                      onMouseEnter={() => paintEnterRow(task.id)}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleSelect(task.id);
                          }
                        }}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.stopPropagation();
                          beginPaintSelect(task.id, checked);
                        }}
                        className="size-4 accent-[#217346] pointer-events-auto"
                        aria-label={`${order}번 행 선택`}
                        data-excel-row-check={task.id}
                      />
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center align-middle text-[14px] font-medium tabular-nums">
                      {order}
                    </td>

                    <EditCell
                      active={
                        !overdue &&
                        focus?.rowId === task.id &&
                        focus.col === "listup"
                      }
                      onFocusCell={() => {
                        setActiveRow(task.id);
                        if (!overdue) {
                          setFocus({ rowId: task.id, col: "listup" });
                        }
                      }}
                      onKeyNav={(e) =>
                        overdue
                          ? undefined
                          : handleNav(e, task.id, "listup", moveFocus)
                      }
                    >
                      <div className="flex w-full flex-col gap-0 px-1.5 py-0.5">
                        {overdue ? (
                          <span
                            className="w-fit rounded-sm bg-[#c45c26] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                            data-excel-overdue-badge
                          >
                            지난 일정
                          </span>
                        ) : null}
                        <AutoGrowTextarea
                          data-excel-cell={`${task.id}:listup`}
                          value={task.title}
                          onChange={(e) =>
                            updateListUp(task, { title: e.target.value })
                          }
                          onBlur={(e) =>
                            maybeWarnSimilarWording(task, {
                              title: e.currentTarget.value,
                            })
                          }
                          onFocus={() => {
                            setActiveRow(task.id);
                            if (!overdue) {
                              setFocus({ rowId: task.id, col: "listup" });
                            }
                          }}
                          className="excel-textarea font-medium"
                          aria-label="할일 LIST UP"
                          placeholder="할 일 제목"
                          readOnly={overdue}
                          disabled={overdue}
                        />
                        <label className="flex flex-col gap-0">
                          <span className="text-[10px] font-medium leading-tight text-[#5c655f]">
                            메모
                          </span>
                          <AutoGrowTextarea
                            data-excel-memo={task.id}
                            value={task.memo}
                            placeholder="일정·메모 입력"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onFocus={() => {
                              setActiveRow(task.id);
                              if (!overdue) {
                                setFocus({ rowId: task.id, col: "listup" });
                              }
                            }}
                            onChange={(e) =>
                              updateListUp(task, { memo: e.target.value })
                            }
                            onBlur={(e) =>
                              maybeWarnSimilarWording(task, {
                                memo: e.currentTarget.value,
                              })
                            }
                            className="excel-textarea excel-textarea-memo"
                            aria-label="메모"
                            readOnly={overdue}
                            disabled={overdue}
                          />
                        </label>
                      </div>
                    </EditCell>

                    {/* 마감목표: 언젠가 | 시작일 ~ 종료일 */}
                    <EditCell
                      active={deadlineFocused}
                      center
                      onFocusCell={() => {
                        setActiveRow(task.id);
                        if (!overdue) {
                          setFocus({ rowId: task.id, col: "deadline" });
                        }
                      }}
                      onKeyNav={(e) =>
                        overdue
                          ? undefined
                          : handleNav(e, task.id, "deadline", moveFocus)
                      }
                    >
                      {overdue ? (
                        <div
                          className="flex min-h-8 w-full flex-col items-center justify-center px-1 py-0.5 text-center text-[13px] leading-snug text-[#5c3a1a]"
                          aria-label="마감목표"
                        >
                          {formatDeadlineRange(task) || (
                            <span className="text-[#999]">시작 ~ 종료</span>
                          )}
                        </div>
                      ) : deadlineFocused ? (
                        <div className="flex w-full flex-col gap-0.5 px-1 py-0.5">
                          <button
                            type="button"
                            data-excel-someday={task.id}
                            aria-pressed={someday}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSomeday(!someday);
                            }}
                            className={`mx-auto w-fit rounded-sm border px-2 py-0.5 text-[11px] font-semibold tracking-tight ${
                              someday
                                ? "border-[#217346] bg-[#217346] text-white"
                                : "border-[#8a939a] bg-white text-[#3a4540] hover:border-[#217346] hover:text-[#217346]"
                            }`}
                          >
                            언젠가
                          </button>
                          {someday ? (
                            <p
                              data-excel-cell={`${task.id}:deadline`}
                              tabIndex={0}
                              className="px-0.5 text-center text-[11px] leading-snug text-[#5c655f] outline-none"
                            >
                              기한 없음 · 칩을 다시 누르면 날짜 선택
                            </p>
                          ) : (
                            <>
                              <label className="flex flex-col items-stretch gap-0 text-[10px] text-[#5c655f]">
                                시작일
                                <input
                                  data-excel-cell={`${task.id}:deadline`}
                                  type="date"
                                  value={task.startDate ?? ""}
                                  min={startMin}
                                  onChange={(e) => {
                                    const v = e.target.value || null;
                                    if (v && v < todayKst) return;
                                    if (!v && !task.targetDate) {
                                      onUpdate(task.id, {
                                        kind: "someday",
                                        startDate: null,
                                        targetDate: null,
                                      });
                                      return;
                                    }
                                    const patch: Partial<Task> = {
                                      kind:
                                        v &&
                                        task.targetDate &&
                                        task.targetDate !== v
                                          ? "ongoing"
                                          : "spot",
                                      startDate: v,
                                    };
                                    if (
                                      v &&
                                      task.targetDate &&
                                      task.targetDate < v
                                    ) {
                                      patch.targetDate = v;
                                    }
                                    applyDeadlinePatch(task, patch);
                                  }}
                                  className="excel-input min-h-7 text-center text-[13px]"
                                  aria-label="시작일"
                                />
                              </label>
                              <label className="flex flex-col items-stretch gap-0 text-[10px] text-[#5c655f]">
                                종료일
                                <input
                                  type="date"
                                  value={task.targetDate ?? ""}
                                  min={endMin}
                                  onChange={(e) => {
                                    const v = e.target.value || null;
                                    const floor =
                                      task.startDate &&
                                      task.startDate >= todayKst
                                        ? task.startDate
                                        : todayKst;
                                    if (v && v < floor) return;
                                    if (!v && !task.startDate) {
                                      onUpdate(task.id, {
                                        kind: "someday",
                                        startDate: null,
                                        targetDate: null,
                                      });
                                      return;
                                    }
                                    const start = task.startDate;
                                    applyDeadlinePatch(task, {
                                      kind:
                                        start && v && start !== v
                                          ? "ongoing"
                                          : "spot",
                                      targetDate: v,
                                    });
                                  }}
                                  className="excel-input min-h-7 text-center text-[13px]"
                                  aria-label="종료일"
                                />
                              </label>
                            </>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`min-h-8 w-full px-1 text-center text-[13px] leading-snug ${
                            someday ? "font-semibold text-[#217346]" : ""
                          }`}
                          onClick={() => {
                            setActiveRow(task.id);
                            setFocus({ rowId: task.id, col: "deadline" });
                          }}
                          aria-label="마감목표"
                          data-excel-deadline-display={task.id}
                        >
                          {formatDeadlineRange(task) || (
                            <span className="text-[#999]">시작 ~ 종료</span>
                          )}
                        </button>
                      )}
                    </EditCell>

                    <EditCell
                      active={
                        !overdue &&
                        focus?.rowId === task.id &&
                        focus.col === "importance"
                      }
                      center
                      onFocusCell={() => {
                        setActiveRow(task.id);
                        if (!overdue) {
                          setFocus({ rowId: task.id, col: "importance" });
                        }
                      }}
                      onKeyNav={(e) =>
                        overdue
                          ? undefined
                          : handleNav(e, task.id, "importance", moveFocus)
                      }
                    >
                      <ScoreSelect
                        cellId={`${task.id}:importance`}
                        value={task.importance}
                        onChange={(n) =>
                          onUpdate(task.id, { importance: n })
                        }
                        label="중요도"
                        disabled={overdue}
                      />
                    </EditCell>

                    <EditCell
                      active={
                        !overdue &&
                        focus?.rowId === task.id &&
                        focus.col === "urgency"
                      }
                      center
                      onFocusCell={() => {
                        setActiveRow(task.id);
                        if (!overdue) {
                          setFocus({ rowId: task.id, col: "urgency" });
                        }
                      }}
                      onKeyNav={(e) =>
                        overdue
                          ? undefined
                          : handleNav(e, task.id, "urgency", moveFocus)
                      }
                    >
                      <ScoreSelect
                        cellId={`${task.id}:urgency`}
                        value={task.urgency}
                        onChange={(n) => onUpdate(task.id, { urgency: n })}
                        label="시급성"
                        disabled={overdue}
                      />
                    </EditCell>

                    <td className="border border-black px-1 py-0.5 text-center align-middle">
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

      <Dialog
        open={Boolean(similarityAlert)}
        onOpenChange={(open) => {
          if (!open) setSimilarityAlert(null);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          data-similarity-alert
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="text-[15px] text-[#1a2420]">
              비슷한 할 일
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-[#3d4a44]">
              {similarityAlert}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              size="sm"
              className="min-h-9 bg-[#217346] text-white hover:bg-[#1a5c38]"
              data-similarity-alert-ok
              onClick={() => setSimilarityAlert(null)}
            >
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
        className={`flex min-h-8 items-stretch ${center ? "justify-center" : ""}`}
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
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  cellId?: string;
  disabled?: boolean;
}) {
  const safe = Math.min(3, Math.max(1, Number(value) || 1));
  return (
    <select
      data-excel-cell={cellId}
      value={safe}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="excel-input text-center disabled:cursor-not-allowed disabled:opacity-60"
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
