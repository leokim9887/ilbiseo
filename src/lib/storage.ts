import {
  APP_VERSION,
  CATEGORY_LABEL,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  type AppState,
  type CalendarEvent,
  type ChecklistItem,
  type Task,
  type TaskCategory,
} from "./types";
import { createId } from "./id";
import { createMockCalendarEvents } from "./calendar-data";
import { inferGroupKey } from "./sort";
import { clampPriority } from "./priority";

export function createEmptyState(): AppState {
  return {
    version: APP_VERSION,
    tasks: [],
    checklists: [],
    calendarEvents: [],
  };
}

function migrateTask(raw: Record<string, unknown>): Task {
  const title = String(raw.title ?? "할 일");
  const notes = String(raw.notes ?? raw.memo ?? "");
  // Old single 마감목표 → end date; startDate empty unless already present
  const end =
    (raw.targetDate as string | null) ??
    (raw.endDate as string | null) ??
    null;
  const start =
    (raw.startDate as string | null) ??
    null;
  return {
    id: String(raw.id ?? createId()),
    title,
    category: (raw.category as TaskCategory) || "work",
    kind: (raw.kind as Task["kind"]) || "someday",
    startDate: start,
    targetDate: end,
    urgency: clampPriority(raw.urgency, 2),
    importance: clampPriority(raw.importance, 2),
    groupKey: String(raw.groupKey ?? title),
    memo: notes,
    source:
      raw.source === "calendar"
        ? "import"
        : ((raw.source as Task["source"]) || "manual"),
    status: (raw.status as Task["status"]) || "active",
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    completedAt: (raw.completedAt as string | null) ?? null,
  };
}

/** Fold leftover checklist items into someday tasks; always persist empty checklists. */
function foldChecklistsIntoTasks(
  tasks: Task[],
  checklists: ChecklistItem[],
): Task[] {
  if (!checklists.length) return tasks;
  const existing = new Set(
    tasks.map((t) => `${t.category}::${t.title.trim().toLowerCase()}`),
  );
  const extras: Task[] = [];
  for (const c of checklists) {
    if (c.checked) continue;
    const title = String(c.title || "").trim();
    if (!title) continue;
    const key = `${c.category}::${title.toLowerCase()}`;
    if (existing.has(key)) continue;
    existing.add(key);
    extras.push({
      id: createId(),
      title,
      category: c.category,
      kind: "someday",
      startDate: null,
      targetDate: null,
      urgency: 2,
      importance: 2,
      groupKey: inferGroupKey(title),
      memo: "예전 체크리스트에서 옮김",
      source: "import",
      status: "active",
      createdAt: c.createdAt || new Date().toISOString(),
      completedAt: null,
    });
  }
  return extras.length ? [...tasks, ...extras] : tasks;
}

export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.tasks)) return null;
  const tasks = obj.tasks.map((t) => migrateTask(t as Record<string, unknown>));
  const legacyChecks = Array.isArray(obj.checklists)
    ? (obj.checklists as ChecklistItem[])
    : [];
  return {
    version: Number(obj.version ?? APP_VERSION),
    tasks: foldChecklistsIntoTasks(tasks, legacyChecks),
    checklists: [],
    calendarEvents: Array.isArray(obj.calendarEvents)
      ? (obj.calendarEvents as CalendarEvent[])
      : [],
  };
}

export function loadState(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const v2 = localStorage.getItem(STORAGE_KEY);
    if (v2) {
      const parsed = JSON.parse(v2) as { checklists?: unknown[] };
      const hadChecks =
        Array.isArray(parsed.checklists) && parsed.checklists.length > 0;
      const rawTasks = Array.isArray(
        (parsed as { tasks?: unknown[] }).tasks,
      )
        ? ((parsed as { tasks: Record<string, unknown>[] }).tasks)
        : [];
      const needsStartMigrate = rawTasks.some(
        (t) => t && typeof t === "object" && !("startDate" in t),
      );
      const n = normalizeState(parsed);
      if (n) {
        if (hadChecks || needsStartMigrate) saveState(n);
        return n;
      }
    }
    const v1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (v1) {
      const legacy = JSON.parse(v1) as { tasks?: unknown[] };
      const n = normalizeState({
        version: APP_VERSION,
        tasks: legacy.tasks ?? [],
        checklists: [],
        calendarEvents: [],
      });
      if (n) {
        if (n.calendarEvents.length === 0) {
          n.calendarEvents = createMockCalendarEvents();
        }
        n.tasks = n.tasks.map((t, i) => ({
          ...t,
          category: (["work", "personal", "project", "team"] as TaskCategory[])[
            i % 4
          ],
        }));
        saveState(n);
        return n;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  const clean: AppState = {
    ...state,
    checklists: [],
    version: APP_VERSION,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

export function createSampleState(): AppState {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const inDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  const task = (
    partial: Omit<Task, "id" | "createdAt" | "completedAt" | "status"> & {
      status?: Task["status"];
      completedAt?: string | null;
    },
  ): Task => ({
    id: createId(),
    createdAt: new Date().toISOString(),
    completedAt: partial.completedAt ?? null,
    status: partial.status ?? "active",
    ...partial,
  });

  return {
    version: APP_VERSION,
    tasks: [
      task({
        title: "후보자 A 이력서 검토",
        category: "work",
        kind: "spot",
        startDate: iso(today),
        targetDate: iso(today),
        urgency: 3,
        importance: 3,
        groupKey: "후보자 이력서",
        source: "manual",
        memo: "오늘 안에 피드백 전달",
      }),
      task({
        title: "클라이언트 B 미팅 자료",
        category: "work",
        kind: "spot",
        startDate: iso(today),
        targetDate: iso(today),
        urgency: 3,
        importance: 3,
        groupKey: "클라이언트 미팅",
        source: "manual",
        memo: "제안서 초안 지참",
      }),
      task({
        title: "포지션 JD 초안 작성",
        category: "project",
        kind: "ongoing",
        startDate: iso(today),
        targetDate: inDays(5),
        urgency: 2,
        importance: 3,
        groupKey: "포지션 JD",
        source: "memo",
        memo: "",
      }),
      task({
        title: "포지션 JD 최종 검수",
        category: "project",
        kind: "ongoing",
        startDate: inDays(3),
        targetDate: inDays(7),
        urgency: 2,
        importance: 3,
        groupKey: "포지션 JD",
        source: "manual",
        memo: "팀 리뷰 반영",
      }),
      task({
        title: "가족 저녁 약속 확인",
        category: "personal",
        kind: "spot",
        startDate: iso(today),
        targetDate: iso(today),
        urgency: 2,
        importance: 3,
        groupKey: "가족",
        source: "manual",
        memo: "장소 확인",
      }),
      task({
        title: "건강검진 예약",
        category: "personal",
        kind: "someday",
        startDate: null,
        targetDate: null,
        urgency: 1,
        importance: 3,
        groupKey: "건강",
        source: "manual",
        memo: "",
      }),
      task({
        title: "신입 온보딩 체크 공유",
        category: "team",
        kind: "ongoing",
        startDate: iso(today),
        targetDate: inDays(3),
        urgency: 2,
        importance: 3,
        groupKey: "온보딩",
        source: "manual",
        memo: "김대리 담당",
      }),
      task({
        title: "주간 리포트 양식",
        category: "team",
        kind: "someday",
        startDate: null,
        targetDate: null,
        urgency: 1,
        importance: 2,
        groupKey: "리포트",
        source: "manual",
        memo: "",
      }),
      task({
        title: "네트워킹 명함 정리",
        category: "work",
        kind: "someday",
        startDate: null,
        targetDate: null,
        urgency: 1,
        importance: 2,
        groupKey: "네트워킹",
        source: "manual",
        memo: "",
      }),
      task({
        title: "헤드헌팅 소개서 템플릿",
        category: "project",
        kind: "someday",
        startDate: null,
        targetDate: null,
        urgency: 1,
        importance: 2,
        groupKey: "소개서",
        source: "ocr",
        memo: "OCR로 가져온 후보",
        status: "completed",
        completedAt: new Date().toISOString(),
      }),
    ],
    checklists: [],
    calendarEvents: createMockCalendarEvents(),
  };
}

export { CATEGORY_LABEL };
