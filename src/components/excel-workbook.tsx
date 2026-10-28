"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  CATEGORY_LABEL,
  FRAME_LABEL,
  FRAME_ORDER,
  isAllFrame,
  isTaskCategory,
  type CalendarEvent,
  type FrameId,
  type SideListItem,
  type SideListKind,
  type Task,
  type TaskCategory,
} from "@/lib/types";
import {
  buildGcalFrameRows,
  buildTaskOnlyRows,
  calendarListUpTitle,
  formatEventDeadline,
  sinkPastSheetRowsLast,
  type SheetRow,
} from "@/lib/sheet-rows";
import {
  formatDeadlineRange,
  formatDeadlineRangeCompact,
  isPastUnfinishedTask,
  isSomedayDeadline,
  monthRangeContaining,
  todayIso,
  todayIsoKst,
  weekRangeContaining,
} from "@/lib/date-range";
import { datedExcelFilename } from "@/lib/excel-filename";
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
import { ToolbarExtras } from "@/components/toolbar-extras";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type { VoiceRowCommit } from "@/components/voice-row-add";

export type WorkbookSheet = "todo" | "done";

/** Open native date picker when clicking anywhere on the field (not only the icon). */
function openDatePickerFromEvent(
  e: { currentTarget: EventTarget & HTMLElement },
) {
  const input =
    e.currentTarget instanceof HTMLInputElement &&
    e.currentTarget.type === "date"
      ? e.currentTarget
      : e.currentTarget.querySelector?.("input[type='date']");
  if (!(input instanceof HTMLInputElement)) return;
  try {
    input.showPicker?.();
  } catch {
    input.focus();
  }
}

type ColKey =
  | "order"
  | "listup"
  | "deadline"
  | "importance"
  | "done"
  | "edit";

/** 할 일: no per-row 완료여부 — bulk 완료 only */
const COLS_TODO: {
  key: ColKey;
  label: string;
  shortLabel: string;
  width: string;
}[] = [
  { key: "order", label: "순서", shortLabel: "순", width: "48px" },
  {
    key: "listup",
    label: "할 일",
    shortLabel: "할일",
    width: "48%",
  },
  {
    key: "deadline",
    label: "마감목표",
    shortLabel: "마감",
    width: "220px",
  },
  {
    key: "importance",
    label: "중요도",
    shortLabel: "중요",
    width: "72px",
  },
];

/** 한 일: 잠금 해제용 「수정」열 유지 */
const COLS_DONE: {
  key: ColKey;
  label: string;
  shortLabel: string;
  width: string;
}[] = [
  { key: "order", label: "순서", shortLabel: "순", width: "48px" },
  {
    key: "listup",
    label: "할 일",
    shortLabel: "할일",
    width: "46%",
  },
  {
    key: "deadline",
    label: "마감목표",
    shortLabel: "마감",
    width: "220px",
  },
  {
    key: "importance",
    label: "중요도",
    shortLabel: "중요",
    width: "72px",
  },
  { key: "edit", label: "수정", shortLabel: "수정", width: "84px" },
];

/** Google Calendar list: no 중요도 / 완료여부 */
const COLS_GCAL: {
  key: ColKey;
  label: string;
  shortLabel: string;
  width: string;
}[] = [
  { key: "order", label: "순서", shortLabel: "순", width: "56px" },
  {
    key: "listup",
    label: "할 일",
    shortLabel: "일정",
    width: "55%",
  },
  {
    key: "deadline",
    label: "마감목표",
    shortLabel: "마감",
    width: "220px",
  },
];

const EDITABLE: ColKey[] = ["listup", "deadline", "importance"];

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
  /** Active + completed — for Excel delta match (program truth). */
  allTasksForImport?: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onCompleteMany?: (ids: string[]) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onRestoreMany?: (ids: string[]) => void;
  /** 「행 추가」 — optional filled fields (voice). Returns the new task when available. */
  onAdd: (partial?: Partial<Task>) => Task | void;
  onImport: (tasks: Task[]) => void;
  /** 현재 틀 할 일·한 일을 가져온 목록으로 교체 (엑셀 불러오기 명시 확인 후) */
  onReplaceCategory?: (category: TaskCategory, tasks: Task[]) => void;
  /** 엑셀 「틀」칸별 교체 */
  onReplaceByCategories?: (tasks: Task[]) => void;
  /** Delta-only: new + changed vs in-app */
  onTodoDelta?: (payload: {
    add: Task[];
    update: { id: string; patch: Partial<Task> }[];
  }) => void;
  onImportSide?: (
    kind: SideListKind,
    items: SideListItem[],
  ) => void;
  onReplaceSide?: (
    kind: SideListKind,
    items: SideListItem[],
  ) => void;
  onSideDelta?: (
    kind: SideListKind,
    payload: {
      add: SideListItem[];
      update: { id: string; patch: Partial<SideListItem> }[];
    },
  ) => void;
  /** Atomic 할 일+지침+습관 delta (one persist). */
  onWorkbookDelta?: (payload: {
    todo: {
      add: Task[];
      update: { id: string; patch: Partial<Task> }[];
    };
    guideline: {
      add: SideListItem[];
      update: { id: string; patch: Partial<SideListItem> }[];
    };
    habit: {
      add: SideListItem[];
      update: { id: string; patch: Partial<SideListItem> }[];
    };
  }) => void;
  onWorkbookReplace?: (opts: {
    tasks?: Task[] | null;
    guidelines?: SideListItem[] | null;
    habits?: SideListItem[] | null;
  }) => void;
  guidelines?: SideListItem[];
  habits?: SideListItem[];
  calendarEvents?: CalendarEvent[];
}

export function ExcelWorkbook({
  sheet,
  frame,
  onFrameChange,
  activeTasks,
  doneTasks,
  allActiveTasks,
  allTasksForImport,
  onUpdate,
  onComplete,
  onCompleteMany,
  onRestore,
  onDelete: _onDelete,
  onDeleteMany,
  onRestoreMany,
  onAdd,
  onImport,
  onReplaceCategory,
  onReplaceByCategories,
  onTodoDelta,
  onImportSide,
  onReplaceSide,
  onSideDelta,
  onWorkbookDelta,
  onWorkbookReplace,
  guidelines = [],
  habits = [],
  calendarEvents = [],
}: ExcelWorkbookProps) {
  const isGcal = frame === "gcal";
  const isAll = isAllFrame(frame);
  const isDoneSheet = sheet === "done";
  const COLS = isGcal ? COLS_GCAL : isDoneSheet ? COLS_DONE : COLS_TODO;
  /** select + COLS length (할 일 has no 완료열; 한 일 keeps 수정) */
  const emptyColSpan = isGcal ? COLS.length : COLS.length + 1;
  const [focus, setFocus] = useState<FocusCell | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** 한 일 rows unlocked via 「수정」 (locked by default, like done 지침/습관). */
  const [editingDoneIds, setEditingDoneIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Keep active row highlight for keyboard/editing (separate from multi-select)
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [filterStart, setFilterStart] = useState<string>("");
  const [filterEnd, setFilterEnd] = useState<string>("");
  /** Excel header column sort (click 마감목표·중요도) */
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
  /** Delta import must see completed rows too (same title+틀 → update, not re-add). */
  const importPeers = allTasksForImport ?? similarityPeers;
  const [similarityAlert, setSimilarityAlert] = useState<string | null>(null);
  /** Conflicting peer — shown in alert; focused after dismiss */
  const [similarityFocusId, setSimilarityFocusId] = useState<string | null>(
    null,
  );
  /** After alert OK: switch 틀 if needed, then scroll/focus this row */
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const similarityAckRef = useRef<Set<string>>(new Set());
  const similarityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseTasks = sheet === "todo" ? activeTasks : doneTasks;

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
      // 할 일 · 한 일: empty dates = all rows; set dates = deadline overlap filter
      built = buildTaskOnlyRows(baseTasks, {
        filterStart: filterStart || null,
        filterEnd: filterEnd || null,
        periodSort: "default",
      });
    }
    // 「전체」 기본: 시작일 내림차순 (언젠가 맨 아래). 헤더 클릭 정렬이 있으면 그게 우선.
    const effectiveSort =
      columnSort ??
      (isAll && !isGcal
        ? ({ key: "deadline", dir: "desc" } as ColumnSort)
        : null);
    const sorted = applyColumnSort(built, effectiveSort);
    // 할 일: 지난 일정은 같은 틀에 두고 맨 아래로 + 구분선 (자동→한 일 없음)
    if (sheet === "todo" && !isGcal) {
      return sinkPastSheetRowsLast(sorted, todayKst);
    }
    return sorted;
  }, [
    isGcal,
    isAll,
    sheet,
    calendarEvents,
    gcalRangeStart,
    gcalRangeEnd,
    gcalChip,
    baseTasks,
    filterStart,
    filterEnd,
    columnSort,
    todayKst,
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
  const selectedDeletableIds = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  );
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

  /**
   * Scroll chaining for PC mouse wheel over the excel table:
   * - If table does not overflow → scroll the page
   * - If at top / bottom edge → continue scrolling the page
   * - Otherwise let the table scroll normally
   * Touch / trackpad overscroll on mobile is left alone (passive where possible).
   */
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch-zoom
      const dy = e.deltaY;
      if (dy === 0) return;
      // Prefer vertical intent; ignore mostly-horizontal pans
      if (Math.abs(e.deltaX) > Math.abs(dy) * 1.25) return;

      const canScrollY = el.scrollHeight > el.clientHeight + 2;
      if (!canScrollY) {
        // Table short — never trap the wheel; move the document
        e.preventDefault();
        window.scrollBy({ top: dy, left: 0, behavior: "auto" });
        return;
      }

      const atTop = el.scrollTop <= 0;
      const atBottom =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((dy < 0 && atTop) || (dy > 0 && atBottom)) {
        e.preventDefault();
        window.scrollBy({ top: dy, left: 0, behavior: "auto" });
      }
      // else: native overflow scroll handles the table
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
      // Same-row title∩memo alone must never alert — peers are OTHER tasks only.
      const hits = findSimilarActiveTasks(candidate, similarityPeers, task.id);
      if (hits.length === 0) return;
      const blob = taskWordingBlob(candidate);
      const fingerprint = `${task.id}|${blob}|${hits.map((h) => h.task.id).join(",")}`;
      if (similarityAckRef.current.has(fingerprint)) return;
      const msg = buildSimilarityAlertMessage(hits, similarityPeers);
      if (!msg) return;
      similarityAckRef.current.add(fingerprint);
      setSimilarityFocusId(hits[0].task.id);
      setSimilarityAlert(msg);
    },
    [similarityPeers],
  );

  const focusSimilarPeerRow = useCallback(
    (peerId: string) => {
      const peer = similarityPeers.find((t) => t.id === peerId);
      if (!peer) {
        setPendingFocusId(peerId);
        return;
      }
      // Ensure the peer's 틀 (or「전체」) is visible so the row exists in DOM
      if (frame === "gcal" || (isTaskCategory(frame) && frame !== peer.category)) {
        onFrameChange(peer.category);
      }
      if (sheet !== "todo") {
        // Peer alerts only fire on active wording — stay/return to 할 일 via parent if needed
      }
      setPendingFocusId(peerId);
    },
    [similarityPeers, frame, onFrameChange, sheet],
  );

  const scheduleSimilarityCheck = useCallback(
    (task: Task, patch: Partial<Pick<Task, "title" | "memo">>) => {
      if (similarityTimerRef.current) clearTimeout(similarityTimerRef.current);
      // Short debounce — still clear while typing; fire quickly after pause
      similarityTimerRef.current = setTimeout(() => {
        maybeWarnSimilarWording(task, patch);
      }, 320);
    },
    [maybeWarnSimilarWording],
  );

  useEffect(() => {
    return () => {
      if (similarityTimerRef.current) clearTimeout(similarityTimerRef.current);
    };
  }, []);

  /**
   * After alert dismiss (or when pendingFocusId set): scroll peer into view,
   * highlight, and autofocus its title field.
   */
  useEffect(() => {
    if (!pendingFocusId || similarityAlert) return;
    const id = pendingFocusId;
    let tries = 0;
    let timer: number | undefined;
    const run = () => {
      const safe =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(id)
          : id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const el = document.querySelector(
        `[data-excel-row="${safe}"]`,
      ) as HTMLElement | null;
      if (!el) {
        // Frame switch may still be painting
        if (tries++ < 12) {
          timer = window.setTimeout(run, 50);
        } else {
          setPendingFocusId(null);
        }
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.setAttribute("data-similarity-focus", "1");
      setActiveRow(id);
      setFocus({ rowId: id, col: "listup" });
      const titleInput = el.querySelector(
        'textarea[aria-label="할 일"], textarea[data-excel-cell]',
      ) as HTMLTextAreaElement | null;
      if (titleInput && !titleInput.disabled && !titleInput.readOnly) {
        titleInput.focus({ preventScroll: true });
        const len = titleInput.value.length;
        try {
          titleInput.setSelectionRange(len, len);
        } catch {
          /* ignore */
        }
      }
      window.setTimeout(() => {
        el.removeAttribute("data-similarity-focus");
      }, 3600);
      setPendingFocusId(null);
    };
    timer = window.setTimeout(run, 60);
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, [pendingFocusId, similarityAlert, rows]);

  const updateListUp = useCallback(
    (task: Task, patch: Partial<Pick<Task, "title" | "memo">>) => {
      onUpdate(task.id, patch);
      scheduleSimilarityCheck(task, patch);
    },
    [onUpdate, scheduleSimilarityCheck],
  );

  /** Voice 「행 추가」: same validators + newest-first insert + similar-todo alert. */
  const commitVoiceRow = useCallback(
    (fields: VoiceRowCommit) => {
      const cat = fields.category;
      if (!isTaskCategory(cat)) return;
      // Switch 틀 so the new row is visible (voice UI may pick a different frame).
      if (frame !== cat) onFrameChange(cat);
      const created = onAdd({
        category: cat,
        title: fields.title,
        memo: fields.memo,
        startDate: fields.startDate,
        targetDate: fields.targetDate,
        kind: fields.kind,
        importance: fields.importance,
      });
      if (created && typeof created === "object" && "id" in created) {
        maybeWarnSimilarWording(created, {
          title: created.title,
          memo: created.memo,
        });
        setActiveRow(created.id);
        setFocus({ rowId: created.id, col: "listup" });
        setPendingFocusId(created.id);
      }
    },
    [frame, onFrameChange, onAdd, maybeWarnSimilarWording],
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
    setEditingDoneIds(new Set());
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
    setEditingDoneIds((prev) => {
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

  const beginEditDone = useCallback((id: string) => {
    setEditingDoneIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const endEditDone = useCallback((id: string) => {
    setEditingDoneIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setFocus((f) => (f?.rowId === id ? null : f));
  }, []);

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
    `min-h-10 h-10 touch-manipulation rounded-sm px-3 text-[14px] font-medium border max-sm:rounded-full max-sm:font-semibold sm:rounded-full sm:font-semibold ${
      chip === c
        ? "border-[var(--toss-blue)] bg-[var(--toss-blue)] text-white"
        : "border-[#8a939a] bg-white text-[#1a2420] hover:bg-[#eef7f1] dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8ece9] dark:hover:bg-[#2a3a32] max-sm:border-[var(--grid-line)] sm:border-[var(--grid-line)] sm:hover:bg-[var(--row-hover)]"
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
    `min-h-10 h-10 touch-manipulation rounded-sm px-3 text-[14px] font-medium border max-sm:rounded-full max-sm:font-semibold sm:rounded-full sm:font-semibold ${
      gcalChip === c
        ? "border-[var(--toss-blue)] bg-[var(--toss-blue)] text-white"
        : "border-[#8a939a] bg-white text-[#1a2420] hover:bg-[#eef3fa] dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8ece9] dark:hover:bg-[#1e2a38] max-sm:border-[var(--grid-line)] sm:border-[var(--grid-line)] sm:hover:bg-[var(--row-hover)]"
    }`;

  return (
    <div className="excel-wb flex flex-col overflow-hidden rounded-sm border border-[#7a8288] bg-[#dfe3e6] shadow-[0_2px_10px_rgba(26,43,54,0.12)] max-sm:rounded-[1rem] max-sm:border-[var(--grid-line)] max-sm:bg-[var(--sheet)] max-sm:shadow-none sm:rounded-[1.125rem] sm:border-[var(--grid-line)] sm:bg-[var(--sheet)] sm:shadow-none dark:border-[#3a4a42] dark:bg-[#1a221e]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#9aa5ad] bg-gradient-to-b from-[#f7f8f9] to-[#e4e7ea] px-3 py-2 dark:border-[#3a4a42] dark:from-[#24302a] dark:to-[#1e2823] sm:border-[var(--grid-line)] sm:bg-[var(--sheet-header)] sm:bg-none">
        <p className="truncate text-[16px] font-semibold tracking-tight text-[#1a2420] dark:text-[#e8ece9] sm:text-[var(--ink)]">
          {datedExcelFilename()}
          <span className="ml-2 text-[13px] font-normal text-[#454d48] dark:text-[#a8b3ad] sm:text-[var(--ink-muted)]">
            — TO DO LIST
          </span>
        </p>
        <p className="text-[14px] tabular-nums text-[#454d48] dark:text-[#a8b3ad]">
          {todayLabel}
        </p>
      </div>

      {/* Ribbon — stack on phone so 틀 + actions stay tappable */}
      <div className="flex flex-col gap-2 border-b border-[#9aa5ad] bg-[#f0f2f4] px-2.5 py-2.5 dark:border-[#3a4a42] dark:bg-[#1e2823] sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:px-3 sm:py-2">
        <label className="flex w-full min-w-0 items-center gap-2 text-[14px] text-[#1a2420] dark:text-[#e8ece9] sm:w-auto sm:flex-initial">
          <span className="shrink-0 font-semibold">틀</span>
          <select
            value={frame}
            onChange={(e) => onFrameChange(e.target.value as FrameId)}
            className="h-11 min-h-11 w-full min-w-0 touch-manipulation rounded-sm border border-[#8a939a] bg-white px-2.5 text-[15px] font-medium outline-none focus:border-[#217346] dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8ece9] sm:h-9 sm:min-h-9 sm:w-auto sm:min-w-[8.5rem]"
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
        {!isGcal ? (
          <div
            className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:w-auto sm:gap-1.5 sm:overflow-visible [&::-webkit-scrollbar]:hidden"
            data-excel-toolbar-actions
            data-excel-bulk-row
          >
            {/* 한 줄: 행 추가 | 추가 기능(음성·엑셀) | 완료 | 선택 삭제 */}
            {sheet === "todo" && !isAll ? (
              <Button
                type="button"
                size="sm"
                className="h-9 min-h-9 shrink-0 touch-manipulation rounded-sm bg-[var(--toss-blue)] px-2 text-[12.5px] font-semibold text-white hover:bg-[#1b64da] max-sm:h-11 max-sm:min-h-11 max-sm:rounded-xl max-sm:px-3 sm:h-9 sm:min-h-9 sm:rounded-lg sm:px-3 sm:text-[14px]"
                onClick={() => onAdd()}
                data-excel-add-row
              >
                <Plus className="size-3.5" />
                행 추가
              </Button>
            ) : null}
            {sheet === "todo" && (isTaskCategory(frame) || isAll) ? (
              <ToolbarExtras
                frame={frame}
                category={isTaskCategory(frame) ? frame : "work"}
                onImport={onImport}
                onReplaceCategory={onReplaceCategory}
                onReplaceByCategories={onReplaceByCategories}
                onTodoDelta={onTodoDelta}
                onImportSide={onImportSide}
                onReplaceSide={onReplaceSide}
                onSideDelta={onSideDelta}
                onWorkbookDelta={onWorkbookDelta}
                onWorkbookReplace={onWorkbookReplace}
                existingTasks={importPeers}
                existingGuidelines={guidelines}
                existingHabits={habits}
                onVoiceCommit={commitVoiceRow}
              />
            ) : null}
            {selectedCount > 0 && sheet === "todo" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 min-h-9 shrink-0 touch-manipulation rounded-sm border-[#217346]/50 px-2 text-[12.5px] text-[#217346] sm:h-9 sm:min-h-9 sm:px-3 sm:text-[14px]"
                onClick={bulkComplete}
                data-excel-bulk-complete
              >
                <Check className="size-3.5" />
                완료
              </Button>
            ) : null}
            {selectedCount > 0 && selectedDeletableIds.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 min-h-9 shrink-0 touch-manipulation rounded-sm border-[#b42318]/40 px-2 text-[12.5px] text-[#b42318] sm:h-9 sm:min-h-9 sm:px-3 sm:text-[14px]"
                onClick={bulkDelete}
                data-excel-bulk-delete
              >
                <Trash2 className="size-3.5" />
                선택 삭제
              </Button>
            ) : null}
            {selectedCount > 0 && sheet === "done" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 min-h-9 shrink-0 touch-manipulation rounded-sm px-2 text-[12.5px] sm:h-9 sm:min-h-9 sm:px-3 sm:text-[14px]"
                onClick={bulkRestore}
                data-excel-bulk-restore
              >
                <RotateCcw className="size-3.5" />
                선택 복원
              </Button>
            ) : null}
          </div>
        ) : null}
        <span className="text-[13px] leading-snug text-[#454d48] dark:text-[#a8b3ad] sm:ml-auto">
          {FRAME_LABEL[frame]} · {taskCount + (isGcal ? calCount : 0)}줄
          {!isGcal && filterActive ? " · 기간" : ""}
          {isGcal && sheet === "todo" && gcalFilterActive ? " · 기간" : ""}
          {columnSort ? ` · ${columnSortLabel(columnSort)}` : ""}
        </span>
      </div>

      {/* Period filter OR Google calendar picker */}
      {isGcal && sheet === "todo" ? (
        <div className="flex flex-col gap-2.5 border-b border-[#9aa5ad] bg-[#e8ecef] px-2.5 py-2.5 dark:border-[#3a4a42] dark:bg-[#1e2823] sm:px-3">
          <span className="text-[14px] font-semibold text-[#1a2420] dark:text-[#e8ece9]">
            기간
          </span>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-[#454d48] dark:text-[#a8b3ad] sm:flex-initial">
              <span className="w-12 shrink-0 sm:w-auto">시작일</span>
              <input
                type="date"
                value={gcalRangeStart}
                onChange={(e) => {
                  setGcalRangeStart(e.target.value);
                  setGcalChip("none");
                }}
                className="h-11 min-h-11 w-full min-w-0 touch-manipulation rounded-sm border border-[#8a939a] bg-white px-2 text-[15px] dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8ece9] sm:h-9 sm:min-h-9 sm:w-auto sm:text-[14px]"
                aria-label="캘린더 기간 시작일"
              />
            </label>
            <span className="hidden text-[#454d48] dark:text-[#a8b3ad] sm:inline">
              ~
            </span>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-[#454d48] dark:text-[#a8b3ad] sm:flex-initial">
              <span className="w-12 shrink-0 sm:w-auto">종료일</span>
              <input
                type="date"
                value={gcalRangeEnd}
                onChange={(e) => {
                  setGcalRangeEnd(e.target.value);
                  setGcalChip("none");
                }}
                className="h-11 min-h-11 w-full min-w-0 touch-manipulation rounded-sm border border-[#8a939a] bg-white px-2 text-[15px] dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8ece9] sm:h-9 sm:min-h-9 sm:w-auto sm:text-[14px]"
                aria-label="캘린더 기간 종료일"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-gcal-chip
              className={gcalChipClass("today")}
              onClick={() => applyGcalChip("today")}
            >
              오늘
            </button>
            <button
              type="button"
              data-gcal-chip
              className={gcalChipClass("week")}
              onClick={() => applyGcalChip("week")}
            >
              이번 주
            </button>
            <button
              type="button"
              data-gcal-chip
              className={gcalChipClass("month")}
              onClick={() => applyGcalChip("month")}
            >
              이번 달
            </button>
            <button
              type="button"
              data-gcal-chip
              className={gcalChipClass("all")}
              onClick={() => applyGcalChip("all")}
            >
              전체
            </button>
            {gcalFilterActive || gcalChip === "all" ? (
              <button
                type="button"
                onClick={clearGcalFilter}
                className="inline-flex h-10 min-h-10 touch-manipulation items-center gap-1 rounded-sm border border-[#8a939a] bg-white px-2.5 text-[14px] text-[#454d48] sm:h-9 sm:min-h-9"
              >
                <X className="size-3.5" />
                필터 지우기
              </button>
            ) : null}
          </div>
        </div>
      ) : !isGcal ? (
      <div className="flex flex-col gap-2.5 border-b border-[#9aa5ad] bg-[#e8ecef] px-2.5 py-2.5 dark:border-[#3a4a42] dark:bg-[#1e2823] sm:px-3">
        <span className="text-[14px] font-semibold text-[#1a2420] dark:text-[#e8ece9]">
          기간
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-[#454d48] dark:text-[#a8b3ad] sm:flex-initial">
            <span className="w-12 shrink-0 sm:w-auto">시작일</span>
            <input
              type="date"
              value={filterStart}
              onChange={(e) => {
                setFilterStart(e.target.value);
                setChip("all");
              }}
              className="h-11 min-h-11 w-full min-w-0 touch-manipulation rounded-sm border border-[#8a939a] bg-white px-2 text-[15px] dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8ece9] sm:h-9 sm:min-h-9 sm:w-auto sm:text-[14px]"
              aria-label="기간 시작일"
            />
          </label>
          <span className="hidden text-[#454d48] dark:text-[#a8b3ad] sm:inline">
            ~
          </span>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-[#454d48] dark:text-[#a8b3ad] sm:flex-initial">
            <span className="w-12 shrink-0 sm:w-auto">종료일</span>
            <input
              type="date"
              value={filterEnd}
              onChange={(e) => {
                setFilterEnd(e.target.value);
                setChip("all");
              }}
              className="h-11 min-h-11 w-full min-w-0 touch-manipulation rounded-sm border border-[#8a939a] bg-white px-2 text-[15px] dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8ece9] sm:h-9 sm:min-h-9 sm:w-auto sm:text-[14px]"
              aria-label="기간 종료일"
            />
          </label>
        </div>
        {/* 한 일: date inputs only — no 오늘/이번 주/이번 달/전체 chips */}
        {sheet === "todo" || filterActive ? (
          <div className="flex flex-wrap items-center gap-2">
            {sheet === "todo" ? (
              <>
                <button type="button" data-period-chip className={chipClass("today")} onClick={() => applyChip("today")}>
                  오늘
                </button>
                <button type="button" data-period-chip className={chipClass("week")} onClick={() => applyChip("week")}>
                  이번 주
                </button>
                <button type="button" data-period-chip className={chipClass("month")} onClick={() => applyChip("month")}>
                  이번 달
                </button>
                <button type="button" data-period-chip className={chipClass("all")} onClick={() => applyChip("all")}>
                  전체
                </button>
              </>
            ) : null}
            {filterActive ? (
              <button
                type="button"
                onClick={clearFilter}
                className="inline-flex h-10 min-h-10 touch-manipulation items-center gap-1 rounded-sm border border-[#8a939a] bg-white px-2.5 text-[14px] text-[#454d48] sm:h-9 sm:min-h-9"
              >
                <X className="size-3.5" />
                필터 지우기
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      ) : null}

      <div className="excel-scroll-wrap excel-fit-mobile-wrap">
      <div
        ref={tableScrollRef}
        className="relative max-h-[min(58dvh,640px)] min-h-[280px] overflow-y-auto overflow-x-hidden overscroll-y-auto bg-white [-webkit-overflow-scrolling:touch] dark:bg-[#1a221e] sm:max-h-[min(68dvh,820px)] sm:min-h-[320px] sm:overflow-auto sm:overscroll-x-contain sm:overscroll-y-auto lg:max-h-[min(72dvh,920px)] xl:max-h-[min(76dvh,1040px)]"
        data-excel-scroll
      >
        <table className="excel-fit-mobile w-full min-w-0 table-fixed border-collapse text-[14px] text-black dark:text-[#e8ece9] sm:text-[16.5px]">
          <colgroup>
            {isGcal ? (
              <>
                <col style={{ width: "6%" }} />
                <col style={{ width: "62%" }} />
                <col style={{ width: "32%" }} />
              </>
            ) : isDoneSheet ? (
              <>
                <col style={{ width: "5%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "46%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
              </>
            ) : (
              <>
                <col style={{ width: "6%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "50%" }} />
                <col style={{ width: "28%" }} />
                <col style={{ width: "11%" }} />
              </>
            )}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              {!isGcal ? (
                <th
                  className="border border-black bg-[#f3f3f3] px-0.5 py-1.5 text-center dark:border-[#4a5c52] dark:bg-[#24302a] sm:px-1 sm:py-2"
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
                const labelNode = (
                  <>
                    <span className="sm:hidden">{c.shortLabel}</span>
                    <span className="hidden sm:inline">{c.label}</span>
                  </>
                );
                return (
                  <th
                    key={`H-${c.key}`}
                    className={`border border-black bg-[#f3f3f3] text-center text-[13px] font-bold leading-tight text-black dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8ece9] sm:text-[16.5px] ${
                      sortable ? "p-0" : "px-0.5 py-1.5 sm:px-2 sm:py-3"
                    }`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onHeaderSort(c.key)}
                        className={`flex min-h-9 w-full items-center justify-center gap-0.5 px-0.5 py-1.5 text-[12.5px] font-bold text-black hover:bg-[#e8efe9] active:bg-[#dce8de] dark:text-[#e8ece9] dark:hover:bg-[#2a3a32] dark:active:bg-[#31443a] sm:min-h-11 sm:px-1 sm:py-2 sm:text-[16px] ${
                          active ? "bg-[#e4efe6] dark:bg-[#2a3a32]" : ""
                        }`}
                        aria-label={`${c.label} 정렬`}
                        title="누르면 정렬이 바뀝니다"
                      >
                        <span>{labelNode}</span>
                        <span
                          className="inline-flex flex-col leading-none text-[#217346]"
                          aria-hidden
                        >
                          {active?.dir === "asc" ? (
                            <ArrowUp className="size-3 stroke-[2.5] sm:size-3.5" />
                          ) : active?.dir === "desc" ? (
                            <ArrowDown className="size-3 stroke-[2.5] sm:size-3.5" />
                          ) : (
                            <span className="text-[10px] font-semibold text-[#5a635e] sm:text-[12px]">
                              ↕
                            </span>
                          )}
                        </span>
                      </button>
                    ) : (
                      labelNode
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
                  colSpan={emptyColSpan}
                  className="border border-black px-4 py-16 text-center text-[16px] text-[#3d4641]"
                >
                  {filterActive && !isGcal && sheet === "todo" ? (
                    <p>
                      이 기간에 할 일이 없습니다.
                    </p>
                  ) : filterActive && !isGcal && sheet === "done" ? (
                    <p>
                      이 기간에 한 일이 없습니다.
                    </p>
                  ) : isGcal && sheet === "todo" ? (
                    <p>
                      {gcalChip === "all"
                        ? "일정이 없습니다."
                        : "이 기간에 일정이 없습니다."}
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
                if (row.kind === "past-separator") {
                  return (
                    <tr
                      key="past-separator"
                      data-excel-past-separator="1"
                      aria-label="지난 일정 구분"
                    >
                      <td
                        colSpan={emptyColSpan}
                        className="border border-black border-t-[3px] border-t-[#8a5a2b] bg-[#f7f0e6] px-2 py-2 text-center dark:border-t-[#c4a574] dark:bg-[#2a241c] sm:px-3 sm:py-2.5"
                      >
                        <span
                          className="text-[13px] font-bold tracking-wide text-[#6b4423] dark:text-[#e8d4b8] sm:text-[15px]"
                          data-excel-past-separator-label
                        >
                          지난 일정
                        </span>
                      </td>
                    </tr>
                  );
                }
                if (row.kind === "calendar") {
                  const ev = row.event;
                  const order =
                    rows
                      .slice(0, idx + 1)
                      .filter((r) => r.kind !== "past-separator").length;
                  return (
                    <tr
                      key={row.id}
                      className="bg-[#eef3fa] ring-1 ring-inset ring-[#3b6ea5]/20"
                      aria-label="캘린더 일정 행"
                    >
                      <td className="border border-black px-0.5 py-1 text-center align-middle text-[12.5px] font-medium tabular-nums text-[#1a3a6b] sm:px-1 sm:text-[15px]">
                        {order}
                      </td>
                      <td className="border border-black border-l-[3px] border-l-[#3b6ea5] px-1 py-1.5 align-top sm:border-l-[4px] sm:px-2 sm:py-2">
                        <p className="break-words text-[13.5px] font-semibold leading-snug text-[#1a2420] sm:text-[15px]">
                          {calendarListUpTitle(ev)}
                        </p>
                      </td>
                      <td className="border border-black px-0.5 py-1.5 text-center align-middle text-[12px] leading-snug break-words text-[#1a2420] sm:px-1 sm:py-2 sm:text-[14.5px]">
                        {formatEventDeadline(ev)}
                      </td>
                    </tr>
                  );
                }

                const task = row.task;
                const order =
                  rows
                    .slice(0, idx + 1)
                    .filter((r) => r.kind === "task" || r.kind === "calendar")
                    .length;
                const checked = selectedIds.has(task.id);
                const editingDone = editingDoneIds.has(task.id);
                const locked = isDoneSheet && !editingDone;
                const active = activeRow === task.id || checked;
                const zebra = order % 2 === 0;
                const someday = isSomedayDeadline(task);
                const past =
                  sheet === "todo" && isPastUnfinishedTask(task, todayKst);
                const deadlineFocused =
                  !locked &&
                  focus?.rowId === task.id &&
                  focus.col === "deadline";
                const startMin = todayKst;
                const endMin =
                  task.startDate && task.startDate >= todayKst
                    ? task.startDate
                    : todayKst;
                const setSomeday = (on: boolean) => {
                  if (locked) return;
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
                const relockIfLeavingRow = (
                  e: FocusEvent<HTMLElement>,
                ) => {
                  if (!isDoneSheet || locked) return;
                  const next = e.relatedTarget as Node | null;
                  const rowEl = e.currentTarget.closest("[data-excel-row]");
                  if (rowEl && next && rowEl.contains(next)) return;
                  endEditDone(task.id);
                };
                return (
                  <tr
                    key={task.id}
                    onClick={() => setActiveRow(task.id)}
                    data-excel-row={task.id}
                    data-excel-row-selected={checked ? "1" : "0"}
                    data-excel-row-locked={locked ? "1" : "0"}
                    data-excel-overdue={past ? "1" : "0"}
                    data-excel-row-editing={
                      isDoneSheet && editingDone ? "1" : "0"
                    }
                    className={
                      checked
                        ? "bg-[#dcefe3] dark:bg-[#1e332d]"
                        : past
                          ? zebra
                            ? "bg-[#f3ebe0] dark:bg-[#2a241c]"
                            : "bg-[#f8f1e8] dark:bg-[#241f1a]"
                          : locked
                            ? zebra
                              ? "bg-[#f2f6f3] dark:bg-[#1c2621]"
                              : "bg-[#f7faf8] dark:bg-[#1a221e]"
                            : active
                              ? "bg-[#e8f5ee] dark:bg-[#1e332d]"
                              : zebra
                                ? "bg-[#fafafa] dark:bg-[#1c2621]"
                                : "bg-white dark:bg-[#1a221e]"
                    }
                  >
                    <td
                      className="border border-black px-0.5 py-0.5 text-center align-middle select-none sm:px-1"
                      data-excel-select-cell={task.id}
                      title="여러 줄 선택"
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
                    <td className="border border-black px-0.5 py-0.5 text-center align-middle text-[12.5px] font-medium tabular-nums sm:px-1 sm:text-[15px]">
                      {order}
                    </td>

                    <EditCell
                      active={
                        !locked &&
                        focus?.rowId === task.id &&
                        focus.col === "listup"
                      }
                      locked={locked}
                      onFocusCell={() => {
                        if (locked) return;
                        setActiveRow(task.id);
                        setFocus({ rowId: task.id, col: "listup" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "listup", moveFocus)
                      }
                    >
                      <div className="flex w-full min-w-0 flex-col gap-0 px-1 py-0 sm:px-1 sm:py-0.5">
                        {isAll ? (
                          <span
                            className="w-fit rounded-sm bg-[#e8ecef] px-1 py-0 text-[11px] font-semibold leading-tight text-[#3a4540] sm:px-1.5 sm:text-[12px]"
                            data-excel-frame-badge={task.category}
                          >
                            {CATEGORY_LABEL[task.category]}
                          </span>
                        ) : null}
                        <AutoGrowTextarea
                          data-excel-cell={`${task.id}:listup`}
                          value={task.title}
                          onChange={(e) =>
                            updateListUp(task, { title: e.target.value })
                          }
                          onBlur={(e) => {
                            maybeWarnSimilarWording(task, {
                              title: e.currentTarget.value,
                            });
                            relockIfLeavingRow(e);
                          }}
                          onFocus={() => {
                            if (locked) return;
                            setActiveRow(task.id);
                            setFocus({ rowId: task.id, col: "listup" });
                          }}
                          readOnly={locked}
                          disabled={locked}
                          className={`excel-textarea font-medium ${
                            locked
                              ? "cursor-default opacity-90 text-[#5a635e]"
                              : ""
                          }`}
                          aria-label="할 일"
                          placeholder="할 일 제목"
                        />
                        <label className="flex flex-col gap-0">
                          <span className="rounded-sm bg-[#e8ecef]/80 px-1 py-0 text-[11px] font-medium leading-tight text-[#454d48] dark:bg-[#24302a] dark:text-[#a8b3ad] sm:text-[12px]">
                            메모
                          </span>
                          <AutoGrowTextarea
                            data-excel-memo={task.id}
                            value={task.memo}
                            placeholder="일정·메모 입력"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onFocus={() => {
                              if (locked) return;
                              setActiveRow(task.id);
                              setFocus({ rowId: task.id, col: "listup" });
                            }}
                            onChange={(e) =>
                              updateListUp(task, { memo: e.target.value })
                            }
                            onBlur={(e) => {
                              maybeWarnSimilarWording(task, {
                                memo: e.currentTarget.value,
                              });
                              relockIfLeavingRow(e);
                            }}
                            readOnly={locked}
                            disabled={locked}
                            className={`excel-textarea excel-textarea-memo ${
                              locked
                                ? "cursor-default opacity-90 text-[#6a7670]"
                                : ""
                            }`}
                            aria-label="메모"
                          />
                        </label>
                      </div>
                    </EditCell>

                    {/* 마감목표: 언젠가 | 시작일 ~ 종료일 */}
                    <EditCell
                      active={deadlineFocused}
                      center
                      locked={locked}
                      onFocusCell={() => {
                        if (locked) return;
                        setActiveRow(task.id);
                        setFocus({ rowId: task.id, col: "deadline" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "deadline", moveFocus)
                      }
                    >
                      {deadlineFocused ? (
                        <div
                          className="flex w-full flex-col gap-0.5 px-1 py-0.5"
                          onBlur={relockIfLeavingRow}
                        >
                          <button
                            type="button"
                            data-excel-someday={task.id}
                            aria-pressed={someday}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSomeday(!someday);
                            }}
                            className={`mx-auto w-fit rounded-sm border px-2 py-0.5 text-[13px] font-semibold tracking-tight ${
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
                              className="px-0.5 text-center text-[13px] leading-snug text-[#454d48] outline-none"
                            >
                              기한 없음
                            </p>
                          ) : (
                            <>
                              <label
                                className="flex cursor-pointer flex-col items-stretch gap-0 text-[12px] text-[#454d48]"
                                data-excel-date-field="start"
                                onClick={openDatePickerFromEvent}
                              >
                                시작일
                                <input
                                  data-excel-cell={`${task.id}:deadline`}
                                  data-excel-date-input="start"
                                  type="date"
                                  value={task.startDate ?? ""}
                                  min={startMin}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDatePickerFromEvent(e);
                                  }}
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
                                  className="excel-input min-h-8 cursor-pointer text-center text-[14px]"
                                  aria-label="시작일"
                                />
                              </label>
                              <label
                                className="flex cursor-pointer flex-col items-stretch gap-0 text-[12px] text-[#454d48]"
                                data-excel-date-field="end"
                                onClick={openDatePickerFromEvent}
                              >
                                종료일
                                <input
                                  data-excel-date-input="end"
                                  type="date"
                                  value={task.targetDate ?? ""}
                                  min={endMin}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDatePickerFromEvent(e);
                                  }}
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
                                  className="excel-input min-h-8 cursor-pointer text-center text-[14px]"
                                  aria-label="종료일"
                                />
                              </label>
                            </>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`min-h-8 w-full px-0.5 py-0.5 text-center text-[12px] leading-snug break-words text-[#1a2420] dark:text-[#e8ece9] sm:min-h-8 sm:px-1 sm:text-[14px] ${
                            someday
                              ? "font-semibold text-[#217346] dark:text-[#5bb8a8]"
                              : ""
                          }`}
                          onClick={() => {
                            setActiveRow(task.id);
                            setFocus({ rowId: task.id, col: "deadline" });
                          }}
                          aria-label="마감목표"
                          data-excel-deadline-display={task.id}
                        >
                          {formatDeadlineRange(task) ? (
                            <>
                              <span className="sm:hidden">
                                {formatDeadlineRangeCompact(task)}
                              </span>
                              <span className="hidden sm:inline">
                                {formatDeadlineRange(task)}
                              </span>
                            </>
                          ) : (
                            <span className="text-[#5a635e] dark:text-[#a8b3ad]">
                              <span className="sm:hidden">날짜</span>
                              <span className="hidden sm:inline">
                                시작 ~ 종료
                              </span>
                            </span>
                          )}
                        </button>
                      )}
                    </EditCell>

                    <EditCell
                      active={
                        !locked &&
                        focus?.rowId === task.id &&
                        focus.col === "importance"
                      }
                      center
                      locked={locked}
                      onFocusCell={() => {
                        if (locked) return;
                        setActiveRow(task.id);
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
                        onBlur={relockIfLeavingRow}
                        label="중요도"
                        disabled={locked}
                      />
                    </EditCell>

                    {isDoneSheet ? (
                      <td className="border border-black px-0.5 py-0 text-center align-middle sm:px-1">
                        {locked ? (
                          <button
                            type="button"
                            className="inline-flex h-9 min-h-9 touch-manipulation items-center justify-center gap-0.5 rounded-sm border border-[#217346]/40 bg-white px-1.5 text-[12px] font-medium text-[#217346] hover:bg-[#e8f5ee] sm:h-8 sm:min-h-8 sm:gap-1 sm:px-2 sm:text-[13px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              beginEditDone(task.id);
                              setActiveRow(task.id);
                              setFocus({ rowId: task.id, col: "listup" });
                            }}
                            aria-label={`${task.title || "할 일"} 수정`}
                            data-excel-edit={task.id}
                            title="수정"
                          >
                            <Pencil className="size-3 sm:size-3.5" aria-hidden />
                            수정
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex h-9 min-h-9 touch-manipulation items-center justify-center gap-0.5 rounded-sm border border-[#217346] bg-[#217346] px-1.5 text-[12px] font-medium text-white hover:bg-[#1a5c38] sm:h-8 sm:min-h-8 sm:gap-1 sm:px-2 sm:text-[13px]"
                            onMouseDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              endEditDone(task.id);
                            }}
                            aria-label={`${task.title || "할 일"} 수정 끝내기`}
                            data-excel-edit-done={task.id}
                            title="수정 끝"
                          >
                            <Check className="size-3 sm:size-3.5" aria-hidden />
                            수정 끝
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </div>

      <Dialog
        open={Boolean(similarityAlert)}
        onOpenChange={(open) => {
          if (!open) {
            const peerId = similarityFocusId;
            setSimilarityAlert(null);
            setSimilarityFocusId(null);
            if (peerId) focusSimilarPeerRow(peerId);
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          data-similarity-alert
          data-similarity-peer={similarityFocusId ?? undefined}
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="text-[16px] text-[var(--ink)]">
              비슷한 할 일
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line text-[14px] leading-relaxed text-[var(--ink-muted)]">
              {similarityAlert}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              size="sm"
              className="min-h-9 bg-[#217346] text-white hover:bg-[#1a5c38]"
              data-similarity-alert-ok
              onClick={() => {
                const peerId = similarityFocusId;
                setSimilarityAlert(null);
                setSimilarityFocusId(null);
                if (peerId) focusSimilarPeerRow(peerId);
              }}
            >
              해당 행으로
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
  locked,
  onFocusCell,
  onKeyNav,
}: {
  children: ReactNode;
  active?: boolean;
  center?: boolean;
  locked?: boolean;
  onFocusCell: () => void;
  onKeyNav: (e: KeyboardEvent) => void;
}) {
  return (
    <td
      className={`border border-black p-0 align-middle dark:border-[#4a5c52] ${
        active
          ? "bg-[#eef7f1] outline outline-2 outline-[#217346] outline-offset-[-2px] dark:bg-[#1e332d] dark:outline-[#3d8f82]"
          : locked
            ? "bg-[#eef2ef] dark:bg-[#222c27]"
            : "dark:bg-[#1a221e]"
      } ${center ? "text-center" : ""}`}
      onClick={onFocusCell}
      onKeyDown={locked ? undefined : onKeyNav}
    >
      <div
        className={`flex min-h-8 items-stretch sm:min-h-8 ${center ? "justify-center" : ""}`}
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
  onBlur,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  cellId?: string;
  disabled?: boolean;
  onBlur?: (e: FocusEvent<HTMLSelectElement>) => void;
}) {
  const safe = Math.min(3, Math.max(1, Number(value) || 1));
  return (
    <select
      data-excel-cell={cellId}
      value={safe}
      aria-label={label}
      disabled={disabled}
      onBlur={onBlur}
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
