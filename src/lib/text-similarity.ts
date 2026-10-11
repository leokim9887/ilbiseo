import type { Task } from "./types";

/** Korean particles / trivial tokens skipped for wording overlap. */
const TRIVIAL = new Set([
  "이",
  "가",
  "을",
  "를",
  "은",
  "는",
  "의",
  "에",
  "와",
  "과",
  "도",
  "로",
  "으로",
  "만",
  "부터",
  "까지",
  "에서",
  "에게",
  "께",
  "한",
  "할",
  "함",
  "및",
  "또",
  "또는",
  "그리고",
  "등",
  "것",
  "수",
  "때",
  "중",
  "내",
  "외",
  "a",
  "an",
  "the",
  "to",
  "of",
  "and",
  "or",
  "for",
  "in",
  "on",
]);

/**
 * Split title/memo into meaningful tokens (Korean-friendly):
 * spaces + punctuation; drop particles and very short tokens.
 */
export function tokenizeMeaningful(text: string): string[] {
  const raw = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const t of raw) {
    if (TRIVIAL.has(t)) continue;
    // Keep CJK 1-char only if it looks contentful (numbers already kept);
    // drop single Latin/digit noise under length 2 except Hangul syllables
    // that survived TRIVIAL filter — Hangul syllables are usually content.
    const isHangul = /[\uac00-\ud7a3]/.test(t);
    if (!isHangul && t.length < 2) continue;
    if (isHangul && t.length < 1) continue;
    out.push(t);
  }
  return out;
}

export function taskWordingBlob(
  task: Pick<Task, "title" | "memo">,
): string {
  return `${task.title ?? ""}\n${task.memo ?? ""}`.trim();
}

export type SimilarityHit = {
  task: Task;
  sharedTokens: string[];
  score: number;
};

/**
 * Substantial wording overlap: several shared meaningful tokens,
 * or high Jaccard when both sides have enough tokens.
 */
export function wordingSimilarity(
  a: string,
  b: string,
): { shared: string[]; score: number; substantial: boolean } {
  const ta = tokenizeMeaningful(a);
  const tb = tokenizeMeaningful(b);
  if (ta.length === 0 || tb.length === 0) {
    return { shared: [], score: 0, substantial: false };
  }
  const setB = new Set(tb);
  const shared = [...new Set(ta.filter((t) => setB.has(t)))];
  const union = new Set([...ta, ...tb]);
  const jaccard = shared.length / union.size;
  const minLen = Math.min(ta.length, tb.length);
  // Thresholds tuned for short Korean titles + memo:
  // · 2+ shared tokens when either side is short
  // · 3+ shared always counts
  // · or Jaccard ≥ 0.45 with ≥2 shared
  const substantial =
    shared.length >= 3 ||
    (shared.length >= 2 && (minLen <= 5 || jaccard >= 0.35)) ||
    (shared.length >= 2 && jaccard >= 0.45);
  return { shared, score: jaccard, substantial };
}

/**
 * Active unfinished peers in the same workbook with similar title/memo.
 * 「언젠가」 is irrelevant (content-based). Excludes self.
 */
export function findSimilarActiveTasks(
  candidate: Pick<Task, "title" | "memo">,
  tasks: readonly Task[],
  excludeId?: string,
): SimilarityHit[] {
  const blob = taskWordingBlob(candidate);
  if (!blob) return [];
  const hits: SimilarityHit[] = [];
  for (const t of tasks) {
    if (excludeId && t.id === excludeId) continue;
    if (t.status !== "active") continue;
    const other = taskWordingBlob(t);
    if (!other) continue;
    const { shared, score, substantial } = wordingSimilarity(blob, other);
    if (!substantial) continue;
    hits.push({ task: t, sharedTokens: shared, score });
  }
  hits.sort((a, b) => b.score - a.score || b.sharedTokens.length - a.sharedTokens.length);
  return hits;
}

/** Short polished Korean copy for in-app alert. */
export function buildSimilarityAlertMessage(hits: SimilarityHit[]): string | null {
  if (hits.length === 0) return null;
  const titles = hits.slice(0, 3).map((h) => h.task.title.trim() || "(제목 없음)");
  if (hits.length === 1) {
    return `비슷한 할 일이 있습니다: 「${titles[0]}」`;
  }
  if (hits.length === 2) {
    return `비슷한 할 일이 있습니다: 「${titles[0]}」, 「${titles[1]}」`;
  }
  const extra = hits.length - 2;
  return `비슷한 할 일이 있습니다: 「${titles[0]}」, 「${titles[1]}」 외 ${extra}건`;
}
