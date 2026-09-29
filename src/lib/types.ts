export type TaskKind = "spot" | "ongoing" | "someday";
export type TaskSource = "manual" | "memo" | "ocr" | "calendar";
export type TaskStatus = "active" | "completed";

export interface Task {
  id: string;
  title: string;
  kind: TaskKind;
  /** YYYY-MM-DD */
  targetDate: string | null;
  /** 1(낮음) ~ 5(높음) */
  urgency: number;
  /** 1(낮음) ~ 5(높음) */
  importance: number;
  /** 유사 할일 묶음용 키 */
  groupKey: string;
  notes: string;
  source: TaskSource;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface AppState {
  tasks: Task[];
  version: number;
}

export const STORAGE_KEY = "ilbiseo-tasks-v1";
export const APP_VERSION = 1;

export const KIND_LABEL: Record<TaskKind, string> = {
  spot: "스팟(당일)",
  ongoing: "지속(~목표일)",
  someday: "언젠가",
};

export const SOURCE_LABEL: Record<TaskSource, string> = {
  manual: "직접",
  memo: "메모",
  ocr: "OCR",
  calendar: "캘린더",
};
