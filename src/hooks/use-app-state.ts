"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppState,
  CalendarEvent,
  ChecklistItem,
  Task,
  TaskCategory,
} from "@/lib/types";
import {
  createEmptyState,
  createSampleState,
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
      if (loaded && (loaded.tasks.length > 0 || loaded.checklists.length > 0)) {
        setState(loaded);
      } else {
        const seeded = createSampleState();
        setState(seeded);
        saveState(seeded);
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
        next.checklists,
        next.calendarEvents,
      );
      const buf = await buildWorkbook({
        tasks: next.tasks,
        checklists: next.checklists,
        calendarEvents: next.calendarEvents,
        briefing,
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
      setState(next);
      try {
        saveState(next);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      }
      if (excelTimer.current) clearTimeout(excelTimer.current);
      excelTimer.current = setTimeout(() => {
        void syncExcel(next);
      }, 600);
    },
    [syncExcel],
  );

  const activeTasks = useCallback(
    (category?: TaskCategory) => sortTasks(state.tasks, category),
    [state.tasks],
  );
  const completedTasks = useCallback(
    (category?: TaskCategory) => sortCompleted(state.tasks, category),
    [state.tasks],
  );

  const checklistsFor = useCallback(
    (category?: TaskCategory) =>
      state.checklists.filter((c) =>
        category ? c.category === category : true,
      ),
    [state.checklists],
  );

  const addTask = useCallback(
    (partial?: Partial<Task>) => {
      const title = partial?.title?.trim() || "새 할 일";
      const task: Task = {
        id: createId(),
        title,
        category: partial?.category ?? "work",
        kind: partial?.kind ?? "spot",
        targetDate:
          partial?.targetDate ??
          (partial?.kind === "someday"
            ? null
            : new Date().toISOString().slice(0, 10)),
        urgency: partial?.urgency ?? 3,
        importance: partial?.importance ?? 3,
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
      persist({ ...state, tasks: [...state.tasks, ...tasks] });
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
          if (patch.title && !patch.groupKey) {
            next.groupKey = inferGroupKey(patch.title);
          }
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

  const addChecklist = useCallback(
    (title: string, category: TaskCategory) => {
      const item: ChecklistItem = {
        id: createId(),
        title: title.trim() || "새 항목",
        category,
        checked: false,
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
      persist({ ...state, checklists: [...state.checklists, item] });
    },
    [persist, state],
  );

  const toggleChecklist = useCallback(
    (id: string, checked: boolean) => {
      persist({
        ...state,
        checklists: state.checklists.map((c) =>
          c.id === id
            ? {
                ...c,
                checked,
                completedAt: checked ? new Date().toISOString() : null,
              }
            : c,
        ),
      });
    },
    [persist, state],
  );

  const deleteChecklist = useCallback(
    (id: string) => {
      persist({
        ...state,
        checklists: state.checklists.filter((c) => c.id !== id),
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

  const resetSamples = useCallback(() => {
    persist(createSampleState());
  }, [persist]);

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
    checklistsFor,
    calendarEvents: state.calendarEvents,
    addTask,
    addMany,
    updateTask,
    completeTask,
    restoreTask,
    deleteTask,
    addChecklist,
    toggleChecklist,
    deleteChecklist,
    setCalendarEvents,
    replaceCalendar,
    resetSamples,
    excelLinked,
    excelStatus,
    setExcelLinked,
    forceExcelSync,
  };
}
