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
  loadExcelHandle,
  supportsFileSystemAccess,
  writeBufferToHandle,
} from "@/lib/excel-link";
import { clampPriority } from "@/lib/priority";
import { isPastUnfinishedTask, todayIsoKst } from "@/lib/date-range";
import { loadSyncPrefs, saveSyncPrefs } from "@/lib/device-sync";

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
      await writeBufferToHandle(handle, buf);
      setExcelStatus(
        `엑셀 갱신됨 · ${new Date().toLocaleTimeString("ko-KR")}`,
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

  const persist = useCallback(
    (next: AppState, opts?: { fromRemote?: boolean; updatedAt?: string }) => {
      const clean = { ...next, checklists: [] as AppState["checklists"] };
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
      const task: Task = {
        id: createId(),
        title,
        category: partial?.category ?? "work",
        kind: partial?.kind ?? "spot",
        startDate:
          partial?.startDate ??
          (partial?.kind === "someday" ? null : todayIsoKst()),
        targetDate:
          partial?.targetDate ??
          (partial?.kind === "someday" ? null : todayIsoKst()),
        urgency: clampPriority(partial?.urgency, 2),
        importance: clampPriority(partial?.importance, 2),
        groupKey: partial?.groupKey ?? inferGroupKey(title),
        memo: partial?.memo ?? "",
        source: partial?.source ?? "manual",
        status: "active",
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
      persist({ ...state, tasks: [...state.tasks, task] });
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
      persist({ ...state, tasks: [...state.tasks, ...normalized] });
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
      const normalized = tasks.map((t) => ({
        ...t,
        urgency: clampPriority(t.urgency),
        importance: clampPriority(t.importance),
      }));
      const cats = new Set(normalized.map((t) => t.category));
      const kept = state.tasks.filter((t) => !cats.has(t.category));
      persist({ ...state, tasks: [...kept, ...normalized] });
    },
    [persist, state],
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

  /**
   * Move overdue active user tasks → 한 일 (same as complete).
   * 「언젠가」 never; GCal is not in tasks. Returns moved tasks (empty if none).
   */
  const autoCompleteOverdueTasks = useCallback((): Task[] => {
    const today = todayIsoKst();
    const overdue = state.tasks.filter((t) => isPastUnfinishedTask(t, today));
    if (overdue.length === 0) return [];
    const complete = new Set(overdue.map((t) => t.id));
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
    return overdue;
  }, [persist, state]);

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
      persist({
        ...state,
        tasks: state.tasks.filter((t) => t.id !== id),
      });
    },
    [persist, state],
  );

  const deleteTasks = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const remove = new Set(ids);
      persist({
        ...state,
        tasks: state.tasks.filter((t) => !remove.has(t.id)),
      });
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
      persist({ ...state, [key]: [...state[key], item] });
      return item;
    },
    [persist, state],
  );

  /** Merge imported 지침/습관 rows (exact dupes already filtered by importer). */
  const addManySideItems = useCallback(
    (kind: SideListKind, items: SideListItem[]) => {
      if (items.length === 0) return;
      const key = sideKey(kind);
      persist({ ...state, [key]: [...state[key], ...items] });
    },
    [persist, state],
  );

  /** Replace all 지침 or 습관 with imported list (explicit confirm). */
  const replaceSideItems = useCallback(
    (kind: SideListKind, items: SideListItem[]) => {
      const key = sideKey(kind);
      persist({ ...state, [key]: items });
    },
    [persist, state],
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
      const key = sideKey(kind);
      persist({
        ...state,
        [key]: state[key].filter((item) => item.id !== id),
      });
    },
    [persist, state],
  );

  const deleteSideItems = useCallback(
    (kind: SideListKind, ids: string[]) => {
      if (ids.length === 0) return;
      const key = sideKey(kind);
      const remove = new Set(ids);
      persist({
        ...state,
        [key]: state[key].filter((item) => !remove.has(item.id)),
      });
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
    updateTask,
    completeTask,
    completeTasks,
    autoCompleteOverdueTasks,
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
