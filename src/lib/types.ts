export type TaskKind = "spot" | "ongoing" | "someday";
export type TaskSource = "manual" | "memo" | "ocr" | "import";
export type TaskStatus = "active" | "completed";
export type TaskCategory = "work" | "personal" | "project" | "team";
/** 틀 dropdown: 4 program frames + Google Calendar frame */
export type FrameId = TaskCategory | "gcal";
export type CalendarSource = "mock" | "ics" | "google";

/** 장부 아래 별도 영역 — 지침 / 습관 (틀이 아님) */
export type SideListKind = "guideline" | "habit";

export const TASK_CATEGORIES: readonly TaskCategory[] = [
  "work",
  "personal",
  "project",
  "team",
] as const;

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  kind: TaskKind;
  /** 시작일 YYYY-MM-DD (마감목표 구간) */
  startDate: string | null;
  /** 종료일(마감) YYYY-MM-DD — legacy field name kept for migration */
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

/** Legacy only — kept so old localStorage still parses; always stored as []. */
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
  /** Google 캘린더 이름(표시용). mock/ICS는 비움 */
  calendarName?: string;
}

/** Editable items for 지침 / 습관 sections below the workbook. */
export interface SideListItem {
  id: string;
  title: string;
  memo: string;
  done: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface AppState {
  version: number;
  tasks: Task[];
  /** Always empty after migration; field kept for load compatibility. */
  checklists: ChecklistItem[];
  calendarEvents: CalendarEvent[];
  guidelines: SideListItem[];
  habits: SideListItem[];
}

export const STORAGE_KEY = "ilbiseo-state-v2";
export const LEGACY_STORAGE_KEY = "ilbiseo-tasks-v1";
export const APP_VERSION = 3;

export const CATEGORY_ORDER: TaskCategory[] = [...TASK_CATEGORIES];

export const FRAME_ORDER: FrameId[] = [...TASK_CATEGORIES, "gcal"];

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  work: "업무용",
  personal: "개인용",
  project: "과제용",
  team: "팀원용",
};

export const FRAME_LABEL: Record<FrameId, string> = {
  ...CATEGORY_LABEL,
  gcal: "구글 캘린더",
};

export const SIDE_LIST_LABEL: Record<SideListKind, string> = {
  guideline: "지침",
  habit: "습관",
};

export function isTaskCategory(f: FrameId | string): f is TaskCategory {
  return (TASK_CATEGORIES as readonly string[]).includes(f);
}

/** Parse stored/imported category; unknown / legacy guideline·habit → work. */
export function parseTaskCategory(raw: unknown): TaskCategory {
  if (typeof raw !== "string") return "work";
  if (raw === "guideline" || raw === "habit") return "work";
  if (isTaskCategory(raw)) return raw;
  const byLabel = (Object.entries(CATEGORY_LABEL) as [TaskCategory, string][])
    .find(([, label]) => label === raw || label.replace(/용$/, "") === raw);
  return byLabel?.[0] ?? "work";
}

/** Legacy category values that belonged to side lists (not 틀). */
export function isLegacySideCategory(
  raw: unknown,
): raw is "guideline" | "habit" {
  return raw === "guideline" || raw === "habit";
}

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
