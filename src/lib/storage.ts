import { APP_VERSION, STORAGE_KEY, type AppState, type Task } from "./types";
import { createId } from "./id";

export function loadState(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.tasks)) return null;
    return { version: parsed.version ?? APP_VERSION, tasks: parsed.tasks };
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createEmptyState(): AppState {
  return { version: APP_VERSION, tasks: [] };
}

export function createSampleTasks(): Task[] {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const inDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  const base = (partial: Omit<Task, "id" | "createdAt" | "completedAt" | "status" | "notes"> & { notes?: string }): Task => ({
    id: createId(),
    createdAt: new Date().toISOString(),
    completedAt: null,
    status: "active",
    notes: partial.notes ?? "",
    ...partial,
  });

  return [
    base({
      title: "후보자 A 이력서 검토",
      kind: "spot",
      targetDate: iso(today),
      urgency: 5,
      importance: 5,
      groupKey: "후보자 이력서",
      source: "manual",
      notes: "오늘 안에 피드백 전달",
    }),
    base({
      title: "클라이언트 B 미팅 준비",
      kind: "spot",
      targetDate: iso(today),
      urgency: 4,
      importance: 5,
      groupKey: "클라이언트 미팅",
      source: "calendar",
    }),
    base({
      title: "포지션 JD 초안 작성",
      kind: "ongoing",
      targetDate: inDays(5),
      urgency: 3,
      importance: 4,
      groupKey: "포지션 JD",
      source: "memo",
    }),
    base({
      title: "포지션 JD 최종 검수",
      kind: "ongoing",
      targetDate: inDays(7),
      urgency: 3,
      importance: 4,
      groupKey: "포지션 JD",
      source: "manual",
    }),
    base({
      title: "네트워킹 명함 정리",
      kind: "someday",
      targetDate: null,
      urgency: 2,
      importance: 3,
      groupKey: "네트워킹",
      source: "manual",
    }),
    base({
      title: "헤드헌팅 소개서 템플릿",
      kind: "someday",
      targetDate: null,
      urgency: 1,
      importance: 4,
      groupKey: "소개서",
      source: "ocr",
    }),
  ];
}
