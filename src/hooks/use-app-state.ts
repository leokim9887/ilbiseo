"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppState,
  CalendarEvent,
  SideListItem,
  SideListKind,
  Task,
  TaskCategory,
} from "@/lib/types";
import {
  applyLocalDeletions,
  clearDeletions,
  createEmptyState,
  loadState,
  saveState,
} from "@/lib/storage";
import { createId } from "@/lib/id";
import { inferGroupKey, sortCompleted, sortTasks } from "@/lib/sort";
import { buildDailyBriefing } from "@/lib/briefing";
import { buildWorkbook } from "@/lib/excel";
import {
  classifyExcelWriteError,
  datedExcelFilename,
  ensureDatedExcelFilename,
  loadExcelHandle,
  msUntilNextKstMidnight,
  needsDatedExcelRename,
  renameExcelHandle,
  supportsFileSystemAccess,
  writeBufferToHandle,
} from "@/lib/excel-link";
import { clampPriority } from "@/lib/priority";
import { todayIsoKst } from "@/lib/date-range";
import { loadSyncPrefs, saveSyncPrefs } from "@/lib/device-sync";
import {
  applyWorkbookDeltaToState,
  applyWorkbookReplaceToState,
  workbookDeltaApplyCount,
  type WorkbookDeltaCommit,
} from "@/lib/excel-import";

type Status = "loading" | "ready" | "error";

export function useAppState() {
  const [state, setState] = useState<AppState>(createEmptyState());
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [excelLinked, setExcelLinked] = useState(false);
  const [excelStatus, setExcelStatus] = useState<string | null>(null);
  /** Bumps on every local persist — device sync watches this. */
  const [persistEpoch, setPersistEpoch] = useState(0);
  const [localUpdatedAt, setLocalUpdatedAt] = useState<string | null>(null);
  const excelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When true, next persist came from remote hydrate — skip push echo. */
  const skipRemotePushRef = useRef(false);
  /** Latest state for day-roll rewrite without stale closures. */
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Last KST calendar day we successfully aligned the linked Excel name to. */
  const lastKstDateRef = useRef<string | null>(null);
  const datingBusyRef = useRef(false);
  const syncExcelRef = useRef<(next: AppState) => Promise<void>>(async () => {});

  useEffect(() => {
    try {
      const loaded = loadState();
      if (loaded) {
        setState(loaded);
      } else {
        const empty = createEmptyState();
        setState(empty);
        saveState(empty);
      }
      const prefs = loadSyncPrefs();
      setLocalUpdatedAt(prefs.localUpdatedAt);
      setStatus("ready");
      loadExcelHandle().then((h) => setExcelLinked(Boolean(h)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장소를 읽지 못했습니다.");
      setStatus("error");
    }
  }, []);

  const syncExcel = useCallback(async (next: AppState) => {
    if (!supportsFileSystemAccess()) return;
    const handle = await loadExcelHandle();
    if (!handle) {
      setExcelLinked(false);
      return;
    }
    setExcelLinked(true);
    try {
      const briefing = buildDailyBriefing(
        next.tasks,
        next.calendarEvents,
        undefined,
        next.guidelines,
        next.habits,
      );
      const buf = await buildWorkbook({
        tasks: next.tasks,
        calendarEvents: next.calendarEvents,
        briefing,
        guidelines: next.guidelines,
        habits: next.habits,
      });
      // Keep Explorer filename on today’s KST stamp when auto-syncing
      // (silent — never open a picker from auto path).
      let writeHandle = handle;
      try {
        const desired = datedExcelFilename();
        if (needsDatedExcelRename(handle.name, desired)) {
          writeHandle = await renameExcelHandle(handle, desired);
        }
      } catch {
        writeHandle = handle;
      }
      await writeBufferToHandle(writeHandle, buf);
      setExcelStatus(
        `엑셀 갱신됨 · ${writeHandle.name || "일비서"} · ${new Date().toLocaleTimeString("ko-KR")}`,
      );
    } catch (e) {
      const { kind, message } = classifyExcelWriteError(e);
      // Keep linked on lock/permission — never clear handle on soft auto-sync errors
      setExcelStatus(
        kind === "locked"
          ? "엑셀이 열려 있어 자동 저장을 건너뛰었습니다. 닫은 뒤 「엑셀 파일 저장」을 눌러 주세요."
          : message,
      );
    }
  }, []);

  syncExcelRef.current = syncExcel;

  /**
   * Auto-rename linked Excel to today’s KST stamp when the calendar day
   * rolls — no 「엑셀 파일 저장」 click required. Never opens a picker.
   * On rename (or day roll with already-correct name), rewrite workbook too.
   */
  const refreshDatedExcelName = useCallback(async () => {
    if (!supportsFileSystemAccess()) return;
    if (datingBusyRef.current) return;
    datingBusyRef.current = true;
    try {
      const today = todayIsoKst();
      const prev = lastKstDateRef.current;
      const rolled = prev !== null && prev !== today;

      // Auto path: only move when permission already granted (no gesture).
      const result = await ensureDatedExcelFilename(new Date(), {
        interactive: false,
      });

      if (result.status === "renamed") {
        lastKstDateRef.current = today;
        setExcelLinked(true);
        setExcelStatus(`엑셀 이름 · ${result.fileName}`);
        await syncExcelRef.current(stateRef.current);
        return;
      }

      if (result.status === "skipped" && result.reason === "no-handle") {
        setExcelLinked(false);
        lastKstDateRef.current = today;
        return;
      }

      if (result.status === "skipped" && result.reason === "same-name") {
        setExcelLinked(true);
        if (rolled) {
          // Name already today’s — still refresh content for the new day.
          await syncExcelRef.current(stateRef.current);
        }
        lastKstDateRef.current = today;
        return;
      }

      if (result.status === "failed") {
        setExcelLinked(true);
        // Keep lastKstDate unset/old so the minute timer retries until move works
        // (permission sticky after a save click, or file unlocked after Excel closed).
        if (rolled || prev === null) {
          const desired = datedExcelFilename();
          if (needsDatedExcelRename(result.fileName, desired)) {
            setExcelStatus(
              "날짜가 바뀌었습니다. 엑셀 파일을 닫은 뒤 이 창을 다시 보거나 「엑셀 파일 저장」을 눌러 주세요.",
            );
          }
        }
      }
    } finally {
      datingBusyRef.current = false;
    }
  }, []);

  // Load + focus / visibility + every minute → align dated name to KST today
  useEffect(() => {
    if (status !== "ready") return;
    void refreshDatedExcelName();

    const onResume = () => {
      if (document.visibilityState === "visible") {
        void refreshDatedExcelName();
      }
    };
    const onFocus = () => void refreshDatedExcelName();

    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onFocus);
    // Periodic check: long midnight setTimeout is throttled in background tabs.
    const interval = window.setInterval(() => {
      void refreshDatedExcelName();
    }, 60_000);
    // Also fire near KST midnight (backup; interval covers missed fires).
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleMidnight = () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      midnightTimer = setTimeout(() => {
        void refreshDatedExcelName().finally(() => scheduleMidnight());
      }, msUntilNextKstMidnight());
    };
    scheduleMidnight();

    return () => {
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
      if (midnightTimer) clearTimeout(midnightTimer);
    };
  }, [status, refreshDatedExcelName]);

  const persist = useCallback(
    (next: AppState, opts?: { fromRemote?: boolean; updatedAt?: string }) => {
      const clean = { ...next, checklists: [] as AppState["checklists"] };
      // Sync ref before setState so back-to-back persists in one click
      // (엑셀 불러오기 할 일→지침→습관) see each other’s writes.
      stateRef.current = clean;
      setState(clean);
      try {
        saveState(clean);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      }

      const now = opts?.updatedAt ?? new Date().toISOString();
      setLocalUpdatedAt(now);
      try {
        const prefs = loadSyncPrefs();
        if (prefs.enabled || prefs.code) {
          saveSyncPrefs({ ...prefs, localUpdatedAt: now });
        }
      } catch {
        /* ignore */
      }

      if (opts?.fromRemote) {
        skipRemotePushRef.current = true;
      } else {
        skipRemotePushRef.current = false;
        setPersistEpoch((n) => n + 1);
      }

      if (excelTimer.current) clearTimeout(excelTimer.current);
      excelTimer.current = setTimeout(() => {
        void syncExcel(clean);
      }, 600);
    },
    [syncExcel],
  );

  /** Apply remote workbook (PC↔phone sync). Does not trigger a push echo. */
  const hydrateFromRemote = useCallback(
    (next: AppState, updatedAt: string) => {
      persist(next, { fromRemote: true, updatedAt });
    },
    [persist],
  );

  /** Insertion / state order — do not re-sort on every title keystroke. */
  const activeTasks = useCallback(
    (category?: TaskCategory) =>
      state.tasks.filter(
        (t) =>
          t.status === "active" &&
          (category ? t.category === category : true),
      ),
    [state.tasks],
  );
  const completedTasks = useCallback(
    (category?: TaskCategory) => sortCompleted(state.tasks, category),
    [state.tasks],
  );

  const addTask = useCallback(
    (partial?: Partial<Task>) => {
      const title = (partial?.title ?? "").trim();
      const kind = partial?.kind ?? "spot";
      const hasStart = partial != null && "startDate" in partial;
      const hasTarget = partial != null && "targetDate" in partial;
      const task: Task = {
        id: createId(),
        title,
        category: partial?.category ?? "work",
        kind,
        // Respect explicit null (언젠가). `??` alone would replace null with today.
        startDate: hasStart
          ? (partial.startDate ?? null)
          : kind === "someday"
            ? null
            : todayIsoKst(),
        targetDate: hasTarget
          ? (partial.targetDate ?? null)
          : kind === "someday"
            ? null
            : todayIsoKst(),
        urgency: clampPriority(partial?.urgency, 2),
        importance: clampPriority(partial?.importance, 2),
        groupKey: partial?.groupKey ?? inferGroupKey(title),
        memo: partial?.memo ?? "",
        source: partial?.source ?? "manual",
        status: "active",
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
      // Newest first: insert at index 0 of the persisted array.
      persist(
        clearDeletions({ ...state, tasks: [task, ...state.tasks] }, [task.id]),
      );
      return task;
    },
    [persist, state],
  );

  const addMany = useCallback(
    (tasks: Task[]) => {
      if (tasks.length === 0) return;
      const normalized = tasks.map((t) => ({
        ...t,
        urgency: clampPriority(t.urgency),
        importance: clampPriority(t.importance),
      }));
      // Imported batch lands on top (same newest-first rule as 「행 추가」).
      persist(
        clearDeletions(
          { ...state, tasks: [...normalized, ...state.tasks] },
          normalized.map((t) => t.id),
        ),
      );
    },
    [persist, state],
  );

  /** Replace all tasks in a category with imported ones (explicit user confirm). */
  const replaceCategoryTasks = useCallback(
    (category: TaskCategory, tasks: Task[]) => {
      const normalized = tasks.map((t) => ({
        ...t,
        category: t.category || category,
        urgency: clampPriority(t.urgency),
        importance: clampPriority(t.importance),
      }));
      const kept = state.tasks.filter((t) => t.category !== category);
      persist({ ...state, tasks: [...kept, ...normalized] });
    },
    [persist, state],
  );

  /**
   * Replace by each task's own 틀 (Excel 「틀」 column).
   * Only categories present in `tasks` are cleared — others stay.
   */
  const replaceByTaskCategories = useCallback(
    (tasks: Task[]) => {
      if (tasks.length === 0) return;
      const prev = stateRef.current;
      const normalized = tasks.map((t) => ({
        ...t,
        urgency: clampPriority(t.urgency),
        importance: clampPriority(t.importance),
      }));
      const cats = new Set(normalized.map((t) => t.category));
      const kept = prev.tasks.filter((t) => !cats.has(t.category));
      persist({ ...prev, tasks: [...kept, ...normalized] });
    },
    [persist],
  );

  /** Apply Excel delta: add new rows + patch changed rows (unchanged skipped). */
  const applyTodoDelta = useCallback(
    (payload: {
      add: Task[];
      update: { id: string; patch: Partial<Task> }[];
    }) => {
      const { add, update } = payload;
      if (add.length === 0 && update.length === 0) return;
      const prev = stateRef.current;
      const byId = new Map(update.map((u) => [u.id, u.patch]));
      let tasks = prev.tasks.map((t) => {
        const patch = byId.get(t.id);
        if (!patch) return t;
        const next = { ...t, ...patch };
        if (patch.urgency !== undefined) {
          next.urgency = clampPriority(patch.urgency);
        }
        if (patch.importance !== undefined) {
          next.importance = clampPriority(patch.importance);
        }
        return next;
      });
      if (add.length > 0) {
        const normalized = add.map((t) => ({
          ...t,
          urgency: clampPriority(t.urgency),
          importance: clampPriority(t.importance),
        }));
        // Newest first — same as addMany
        tasks = [...normalized, ...tasks];
      }
      persist({ ...prev, tasks });
    },
    [persist],
  );

  const applySideDelta = useCallback(
    (
      kind: SideListKind,
      payload: {
        add: SideListItem[];
        update: { id: string; patch: Partial<SideListItem> }[];
      },
    ) => {
      const { add, update } = payload;
      if (add.length === 0 && update.length === 0) return;
      const prev = stateRef.current;
      const key = sideKey(kind);
      const byId = new Map(update.map((u) => [u.id, u.patch]));
      let items = prev[key].map((item) => {
        const patch = byId.get(item.id);
        return patch ? { ...item, ...patch, done: false } : item;
      });
      if (add.length > 0) {
        items = [
          ...add.map((i) => ({ ...i, done: false, completedAt: null })),
          ...items,
        ];
      }
      persist({ ...prev, [key]: items });
    },
    [persist],
  );

  /**
   * One persist for 할 일+지침+습관 (엑셀 불러오기「반영」).
   * Avoids last-write-wins when three deltas fire in the same click.
   */
  const applyWorkbookDelta = useCallback(
    (delta: WorkbookDeltaCommit) => {
      if (workbookDeltaApplyCount(delta) === 0) return;
      persist(applyWorkbookDeltaToState(stateRef.current, delta));
    },
    [persist],
  );

  /** One persist for import「목록 바꾸기」across sheets. */
  const applyWorkbookReplace = useCallback(
    (opts: {
      tasks?: Task[] | null;
      guidelines?: SideListItem[] | null;
      habits?: SideListItem[] | null;
    }) => {
      persist(applyWorkbookReplaceToState(stateRef.current, opts));
    },
    [persist],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      persist({
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== id) return t;
          const next = { ...t, ...patch };
          if (patch.urgency !== undefined) {
            next.urgency = clampPriority(patch.urgency);
          }
          if (patch.importance !== undefined) {
            next.importance = clampPriority(patch.importance);
          }
          // Do not re-infer groupKey on every title keystroke — that regrouped
          // rows under sortTasks. groupKey is set once at create/import.
          return next;
        }),
      });
    },
    [persist, state],
  );

  const completeTask = useCallback(
    (id: string) => {
      persist({
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "completed",
                completedAt: new Date().toISOString(),
              }
            : t,
        ),
      });
    },
    [persist, state],
  );

  const completeTasks = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const complete = new Set(ids);
      const completedAt = new Date().toISOString();
      persist({
        ...state,
        tasks: state.tasks.map((t) =>
          complete.has(t.id) && t.status !== "completed"
            ? {
                ...t,
                status: "completed",
                completedAt,
              }
            : t,
        ),
      });
    },
    [persist, state],
  );

  const restoreTask = useCallback(
    (id: string) => {
      persist({
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === id
            ? { ...t, status: "active", completedAt: null }
            : t,
        ),
      });
    },
    [persist, state],
  );

  const deleteTask = useCallback(
    (id: string) => {
      persist(applyLocalDeletions(state, [id]));
    },
    [persist, state],
  );

  const deleteTasks = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      persist(applyLocalDeletions(state, ids));
    },
    [persist, state],
  );

  const restoreTasks = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const restore = new Set(ids);
      persist({
        ...state,
        tasks: state.tasks.map((t) =>
          restore.has(t.id)
            ? { ...t, status: "active", completedAt: null }
            : t,
        ),
      });
    },
    [persist, state],
  );

  const setCalendarEvents = useCallback(
    (events: CalendarEvent[]) => {
      persist({ ...state, calendarEvents: events });
    },
    [persist, state],
  );

  const replaceCalendar = useCallback(
    (events: CalendarEvent[], mode: "replace" | "append" = "replace") => {
      persist({
        ...state,
        calendarEvents:
          mode === "append"
            ? [...state.calendarEvents, ...events]
            : events,
      });
    },
    [persist, state],
  );

  const clearAllData = useCallback(() => {
    persist(createEmptyState());
  }, [persist]);

  const sideKey = (kind: SideListKind): "guidelines" | "habits" =>
    kind === "guideline" ? "guidelines" : "habits";

  const addSideItem = useCallback(
    (kind: SideListKind) => {
      const key = sideKey(kind);
      const item: SideListItem = {
        id: createId(),
        title: "",
        memo: "",
        done: false,
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
      persist(
        clearDeletions({ ...state, [key]: [item, ...state[key]] }, [item.id]),
      );
      return item;
    },
    [persist, state],
  );

  /** Merge imported 지침/습관 rows (exact dupes already filtered by importer). */
  const addManySideItems = useCallback(
    (kind: SideListKind, items: SideListItem[]) => {
      if (items.length === 0) return;
      const key = sideKey(kind);
      persist(
        clearDeletions(
          { ...state, [key]: [...items, ...state[key]] },
          items.map((i) => i.id),
        ),
      );
    },
    [persist, state],
  );

  /** Replace all 지침 or 습관 with imported list (explicit confirm). */
  const replaceSideItems = useCallback(
    (kind: SideListKind, items: SideListItem[]) => {
      const key = sideKey(kind);
      const prev = stateRef.current;
      persist({ ...prev, [key]: items });
    },
    [persist],
  );

  const updateSideItem = useCallback(
    (kind: SideListKind, id: string, patch: Partial<SideListItem>) => {
      const key = sideKey(kind);
      persist({
        ...state,
        [key]: state[key].map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      });
    },
    [persist, state],
  );

  const toggleSideItem = useCallback(
    (kind: SideListKind, id: string) => {
      const key = sideKey(kind);
      persist({
        ...state,
        [key]: state[key].map((item) => {
          if (item.id !== id) return item;
          const done = !item.done;
          return {
            ...item,
            done,
            completedAt: done ? new Date().toISOString() : null,
          };
        }),
      });
    },
    [persist, state],
  );

  const deleteSideItem = useCallback(
    (kind: SideListKind, id: string) => {
      persist(applyLocalDeletions(state, [id]));
    },
    [persist, state],
  );

  const deleteSideItems = useCallback(
    (kind: SideListKind, ids: string[]) => {
      if (ids.length === 0) return;
      persist(applyLocalDeletions(state, ids));
    },
    [persist, state],
  );

  /** Mark selected 지침/습관 items done (checked-off); no-op if already done. */
  const completeSideItems = useCallback(
    (kind: SideListKind, ids: string[]) => {
      if (ids.length === 0) return;
      const key = sideKey(kind);
      const complete = new Set(ids);
      const completedAt = new Date().toISOString();
      persist({
        ...state,
        [key]: state[key].map((item) =>
          complete.has(item.id) && !item.done
            ? { ...item, done: true, completedAt }
            : item,
        ),
      });
    },
    [persist, state],
  );

  const forceExcelSync = useCallback(async () => {
    await syncExcel(state);
  }, [state, syncExcel]);

  /** Soft re-read from local storage (pull-to-refresh / focus recovery). */
  const reloadFromStorage = useCallback(() => {
    try {
      const loaded = loadState();
      if (loaded) {
        setState(loaded);
      }
      const prefs = loadSyncPrefs();
      setLocalUpdatedAt(prefs.localUpdatedAt);
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장소를 읽지 못했습니다.");
    }
  }, []);

  const allActive = useMemo(() => sortTasks(state.tasks), [state.tasks]);
  const allCompleted = useMemo(
    () => sortCompleted(state.tasks),
    [state.tasks],
  );

  return {
    status,
    error,
    state,
    allActive,
    allCompleted,
    activeTasks,
    completedTasks,
    calendarEvents: state.calendarEvents,
    guidelines: state.guidelines,
    habits: state.habits,
    addTask,
    addMany,
    replaceCategoryTasks,
    replaceByTaskCategories,
    applyTodoDelta,
    applySideDelta,
    applyWorkbookDelta,
    applyWorkbookReplace,
    updateTask,
    completeTask,
    completeTasks,
    restoreTask,
    deleteTask,
    deleteTasks,
    restoreTasks,
    addSideItem,
    addManySideItems,
    replaceSideItems,
    updateSideItem,
    toggleSideItem,
    deleteSideItem,
    deleteSideItems,
    completeSideItems,
    setCalendarEvents,
    replaceCalendar,
    clearAllData,
    resetSamples: clearAllData,
    excelLinked,
    excelStatus,
    setExcelLinked,
    forceExcelSync,
    reloadFromStorage,
    hydrateFromRemote,
    persistEpoch,
    localUpdatedAt,
    skipRemotePushRef,
  };
}
