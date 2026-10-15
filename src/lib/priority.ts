/** 중요도 척도 (1–3). 시급성 필드는 JSON에 남을 수 있으나 UI·브리핑·엑셀에서는 쓰지 않음. */
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

/** @deprecated 시급성 UI 제거 — 예전 데이터/호환용 */
export function urgencyLabel(n: number): string {
  if (n >= 3) return "시급";
  if (n >= 2) return "보통";
  return "여유";
}

/** 브리핑 태그 — 중요도만 사용 (시급성 미표시) */
export function priorityTag(importance: number, _urgency?: number): string {
  if (importance >= 3) return "★최우선";
  if (importance >= 2) return "◆우선";
  return "";
}
