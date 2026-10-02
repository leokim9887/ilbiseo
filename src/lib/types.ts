export type TaskKind = "spot" | "ongoing" | "someday";
export type TaskSource = "manual" | "memo" | "ocr" | "import";
export type TaskStatus = "active" | "completed";
export type TaskCategory = "work" | "personal" | "project" | "team";
export type CalendarSource = "mock" | "ics" | "google";

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  kind: TaskKind;
  /** YYYY-MM-DD */
  targetDate: string | null;
  urgency: number;
  importance: number;
  groupKey: string;
  /** 일정·항목 옆 짧은 메모 */
  memo: string;
  source: TaskSource;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface ChecklistItem {
  id: string;
  title: string;
  category: TaskCategory;
  checked: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** YYYY-MM-DD or ISO datetime */
  start: string;
  end: string | null;
  allDay: boolean;
  notes: string;
  source: CalendarSource;
}

export interface AppState {
  version: number;
  tasks: Task[];
  checklists: ChecklistItem[];
  calendarEvents: CalendarEvent[];
}

export const STORAGE_KEY = "ilbiseo-state-v2";
export const LEGACY_STORAGE_KEY = "ilbiseo-tasks-v1";
export const APP_VERSION = 2;

export const CATEGORY_ORDER: TaskCategory[] = [
  "work",
  "personal",
  "project",
  "team",
];

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  work: "업무용",
  personal: "개인용",
  project: "과제용",
  team: "팀원용",
};

export const KIND_LABEL: Record<TaskKind, string> = {
  spot: "스팟(당일)",
  ongoing: "지속(~목표일)",
  someday: "언젠가",
};

export const SOURCE_LABEL: Record<TaskSource, string> = {
  manual: "직접",
  memo: "메모",
  ocr: "OCR",
  import: "가져오기",
};
