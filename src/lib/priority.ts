/** 중요도·시급성 공통 척도 (1–3) */
export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 3;
export const PRIORITY_OPTIONS = [1, 2, 3] as const;

/** 로드·입력 시 1–3으로 고정. 예전 4·5는 3으로 내림. */
export function clampPriority(n: unknown, fallback = 2): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(PRIORITY_MAX, Math.max(PRIORITY_MIN, Math.round(v)));
}

export function importanceLabel(n: number): string {
  if (n >= 3) return "중요";
  if (n >= 2) return "보통";
  return "낮음";
}

export function urgencyLabel(n: number): string {
  if (n >= 3) return "시급";
  if (n >= 2) return "보통";
  return "여유";
}

export function priorityTag(importance: number, urgency: number): string {
  if (importance >= 3 || urgency >= 3) return "★최우선";
  if (importance >= 2 || urgency >= 2) return "◆우선";
  return "";
}
