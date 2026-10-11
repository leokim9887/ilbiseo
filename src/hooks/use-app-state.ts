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
  loadExcelHandle,
  supportsFileSystemAccess,
  writeBufferToHandle,
} from "@/lib/excel-link";
import { clampPriority } from "@/lib/priority";
import { todayIsoKst } from "@/lib/date-range";

type Status = "loading" | "ready" | "error";

export function useAppState() {
  const [state, setState] = useState<AppState>(createEmptyState());
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [excelLinked, setExcelLinked] = useState(false);
  const [excelStatus, setExcelStatus] = useState<string | null>(null);
  const excelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setExcelStatus(
        e instanceof Error ? e.message : "엑셀 자동 저장에 실패했습니다.",
      );
    }
  }, []);

  const persist = useCallback(
    (next: AppState) => {
      const clean = { ...next, checklists: [] as AppState["checklists"] };
      setState(clean);
      try {
        saveState(clean);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      }
      if (excelTimer.current) clearTimeout(excelTimer.current);
      excelTimer.current = setTimeout(() => {
        void syncExcel(clean);
      }, 600);
    },
    [syncExcel],
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
      const title = partial?.title?.trim() || "새 할 일";
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
        title: kind === "guideline" ? "새 지침" : "새 습관",
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

  const forceExcelSync = useCallback(async () => {
    await syncExcel(state);
  }, [state, syncExcel]);

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
    updateTask,
    completeTask,
    completeTasks,
    restoreTask,
    deleteTask,
    deleteTasks,
    restoreTasks,
    addSideItem,
    updateSideItem,
    toggleSideItem,
    deleteSideItem,
    deleteSideItems,
    setCalendarEvents,
    replaceCalendar,
    clearAllData,
    resetSamples: clearAllData,
    excelLinked,
    excelStatus,
    setExcelLinked,
    forceExcelSync,
  };
}
