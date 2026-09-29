"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppState, Task } from "@/lib/types";
import {
  createEmptyState,
  createSampleTasks,
  loadState,
  saveState,
} from "@/lib/storage";
import { createId } from "@/lib/id";
import { inferGroupKey, sortCompleted, sortTasks } from "@/lib/sort";

type Status = "loading" | "ready" | "error";

export function useTasks() {
  const [state, setState] = useState<AppState>(createEmptyState());
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const loaded = loadState();
      if (loaded && loaded.tasks.length > 0) {
        setState(loaded);
      } else {
        const seeded: AppState = {
          version: 1,
          tasks: createSampleTasks(),
        };
        setState(seeded);
        saveState(seeded);
      }
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장소를 읽지 못했습니다.");
      setStatus("error");
    }
  }, []);

  const persist = useCallback((next: AppState) => {
    setState(next);
    try {
      saveState(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    }
  }, []);

  const activeTasks = useMemo(() => sortTasks(state.tasks), [state.tasks]);
  const completedTasks = useMemo(
    () => sortCompleted(state.tasks),
    [state.tasks],
  );

  const addTask = useCallback(
    (partial?: Partial<Task>) => {
      const title = partial?.title?.trim() || "새 할 일";
      const task: Task = {
        id: createId(),
        title,
        kind: partial?.kind ?? "spot",
        targetDate:
          partial?.targetDate ??
          (partial?.kind === "someday"
            ? null
            : new Date().toISOString().slice(0, 10)),
        urgency: partial?.urgency ?? 3,
        importance: partial?.importance ?? 3,
        groupKey: partial?.groupKey ?? inferGroupKey(title),
        notes: partial?.notes ?? "",
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

  const clearCompleted = useCallback(() => {
    persist({
      ...state,
      tasks: state.tasks.filter((t) => t.status !== "completed"),
    });
  }, [persist, state]);

  const resetSamples = useCallback(() => {
    const next = { version: 1, tasks: createSampleTasks() };
    persist(next);
  }, [persist]);

  return {
    status,
    error,
    activeTasks,
    completedTasks,
    addTask,
    addMany,
    updateTask,
    completeTask,
    restoreTask,
    deleteTask,
    clearCompleted,
    resetSamples,
  };
}
