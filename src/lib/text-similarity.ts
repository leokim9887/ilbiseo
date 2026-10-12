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
 * Long Hangul compounds also yield overlapping bigrams so
 * "병원진료" ≈ "병원 진료" still overlaps.
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
  const seen = new Set<string>();
  const push = (t: string) => {
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const t of raw) {
    if (TRIVIAL.has(t)) continue;
    const isHangul = /[\uac00-\ud7a3]/.test(t);
    if (!isHangul && t.length < 2) continue;
    if (isHangul && t.length < 1) continue;
    push(t);
    // Hangul compound without spaces → syllable bigrams (lower false negatives)
    if (isHangul && t.length >= 4) {
      for (let i = 0; i <= t.length - 2; i++) {
        push(t.slice(i, i + 2));
      }
    }
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
 * Substantial wording overlap between two fields.
 * Tuned assertive for short Korean titles + memos (fewer false negatives).
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
  const hasStrongToken = shared.some((t) => t.length >= 3);
  // Assertive thresholds:
  // · 1 strong (≥3 char) shared token
  // · 2+ shared tokens
  // · Jaccard ≥ 0.35 with ≥1 shared on short sides
  const substantial =
    (shared.length >= 1 && hasStrongToken) ||
    shared.length >= 2 ||
    (shared.length >= 1 && minLen <= 4 && jaccard >= 0.35);
  return { shared, score: jaccard, substantial };
}

/**
 * Best cross-field overlap between candidate and another task.
 * Compares title↔title, title↔memo, memo↔title, memo↔memo of the OTHER row only.
 * Never compares candidate.title ↔ candidate.memo (same-row self overlap).
 */
function crossFieldSimilarity(
  candidate: Pick<Task, "title" | "memo">,
  other: Pick<Task, "title" | "memo">,
): { shared: string[]; score: number; substantial: boolean } {
  const pairs: [string, string][] = [
    [candidate.title ?? "", other.title ?? ""],
    [candidate.title ?? "", other.memo ?? ""],
    [candidate.memo ?? "", other.title ?? ""],
    [candidate.memo ?? "", other.memo ?? ""],
  ];
  let best = { shared: [] as string[], score: 0, substantial: false };
  for (const [a, b] of pairs) {
    if (!a.trim() || !b.trim()) continue;
    const result = wordingSimilarity(a, b);
    if (
      result.substantial &&
      (result.score > best.score ||
        result.shared.length > best.shared.length ||
        !best.substantial)
    ) {
      best = result;
    }
  }
  return best;
}

/**
 * Active unfinished peers with similar title/memo.
 * Excludes self by id — same-row title∩memo never triggers.
 */
export function findSimilarActiveTasks(
  candidate: Pick<Task, "title" | "memo">,
  tasks: readonly Task[],
  excludeId?: string,
): SimilarityHit[] {
  const hasContent =
    Boolean((candidate.title ?? "").trim()) ||
    Boolean((candidate.memo ?? "").trim());
  if (!hasContent) return [];
  const hits: SimilarityHit[] = [];
  for (const t of tasks) {
    // Hard exclude: never compare a row to itself (title↔memo same row).
    if (excludeId != null && t.id === excludeId) continue;
    if (t.status !== "active") continue;
    const { shared, score, substantial } = crossFieldSimilarity(candidate, t);
    if (!substantial) continue;
    hits.push({ task: t, sharedTokens: shared, score });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score || b.sharedTokens.length - a.sharedTokens.length,
  );
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
