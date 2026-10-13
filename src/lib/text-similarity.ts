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
  "새",
  "할일",
  "일정",
  "메모",
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

/** Placeholder / empty-row titles that must never trigger peer alerts. */
const PLACEHOLDER_TITLES = new Set([
  "새 할일",
  "새할일",
  "할 일",
  "할일",
  "제목 없음",
  "(제목 없음)",
]);

/**
 * Split title/memo into meaningful word tokens (Korean-friendly).
 * Does NOT emit Hangul syllable bigrams — those caused false "already exists"
 * alerts from partial syllable overlaps between unrelated phrases.
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
  for (const t of raw) {
    if (TRIVIAL.has(t)) continue;
    const isHangul = /[\uac00-\ud7a3]/.test(t);
    // Hangul: need ≥2 syllables; Latin/digits: ≥2 chars
    if (isHangul && t.length < 2) continue;
    if (!isHangul && t.length < 2) continue;
    if (seen.has(t)) continue;
    seen.add(t);
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

function normalizeCompact(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Substantial wording overlap between two fields.
 * Tuned for father UX: only real duplicates / near-duplicates, not loose shares.
 */
export function wordingSimilarity(
  a: string,
  b: string,
  opts?: { crossField?: boolean },
): { shared: string[]; score: number; substantial: boolean } {
  const crossField = Boolean(opts?.crossField);
  const na = normalizeCompact(a);
  const nb = normalizeCompact(b);
  if (!na || !nb) {
    return { shared: [], score: 0, substantial: false };
  }

  // Exact / near-exact after stripping punctuation · spaces
  if (na === nb && na.length >= 4) {
    const ta = tokenizeMeaningful(a);
    return { shared: ta.length ? ta : [na], score: 1, substantial: true };
  }
  if (
    na.length >= 6 &&
    nb.length >= 6 &&
    (na.includes(nb) || nb.includes(na))
  ) {
    const shorter = na.length <= nb.length ? na : nb;
    const longer = na.length > nb.length ? na : nb;
    if (shorter.length / longer.length >= 0.72) {
      const ta = tokenizeMeaningful(a);
      return {
        shared: ta.length ? ta : [shorter],
        score: shorter.length / longer.length,
        substantial: true,
      };
    }
  }

  const ta = tokenizeMeaningful(a);
  const tb = tokenizeMeaningful(b);
  if (ta.length === 0 || tb.length === 0) {
    return { shared: [], score: 0, substantial: false };
  }
  const setB = new Set(tb);
  const shared = [...new Set(ta.filter((t) => setB.has(t)))];
  const union = new Set([...ta, ...tb]);
  const jaccard = shared.length / union.size;
  // Hangul words are usually 2 syllables — length≥2 is already meaningful
  const strongShared = shared.filter((t) => t.length >= 2);

  // Same-field (title↔title / memo↔memo): careful but catches real dupes
  // Cross-field (title↔memo): stricter — one shared memo word must not alert
  let substantial = false;
  if (crossField) {
    substantial =
      (strongShared.length >= 3 && jaccard >= 0.45) ||
      (strongShared.length >= 2 && jaccard >= 0.6);
  } else {
    substantial =
      (strongShared.length >= 2 && jaccard >= 0.45) ||
      (strongShared.length >= 1 &&
        jaccard >= 0.7 &&
        Math.min(ta.length, tb.length) <= 2);
  }

  return { shared, score: jaccard, substantial };
}

/**
 * Best cross-field overlap between candidate and another task.
 * Never compares candidate.title ↔ candidate.memo (same-row self overlap).
 */
function crossFieldSimilarity(
  candidate: Pick<Task, "title" | "memo">,
  other: Pick<Task, "title" | "memo">,
): { shared: string[]; score: number; substantial: boolean } {
  const pairs: { a: string; b: string; crossField: boolean }[] = [
    { a: candidate.title ?? "", b: other.title ?? "", crossField: false },
    { a: candidate.memo ?? "", b: other.memo ?? "", crossField: false },
    { a: candidate.title ?? "", b: other.memo ?? "", crossField: true },
    { a: candidate.memo ?? "", b: other.title ?? "", crossField: true },
  ];
  let best = { shared: [] as string[], score: 0, substantial: false };
  for (const { a, b, crossField } of pairs) {
    if (!a.trim() || !b.trim()) continue;
    const result = wordingSimilarity(a, b, { crossField });
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

function isPlaceholderTitle(title: string): boolean {
  const t = title.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return true;
  if (PLACEHOLDER_TITLES.has(title.trim()) || PLACEHOLDER_TITLES.has(t)) {
    return true;
  }
  return false;
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
  const title = (candidate.title ?? "").trim();
  const memo = (candidate.memo ?? "").trim();
  // Need real content; placeholders alone never alert
  if (!title && !memo) return [];
  if (isPlaceholderTitle(title) && !memo) return [];
  // Too short to be a meaningful duplicate signal
  const blob = `${title}${memo}`;
  if (normalizeCompact(blob).length < 4) return [];

  const hits: SimilarityHit[] = [];
  for (const t of tasks) {
    // Hard exclude: never compare a row to itself (title↔memo same row).
    if (excludeId != null && t.id === excludeId) continue;
    if (t.status !== "active") continue;
    if (isPlaceholderTitle(t.title) && !(t.memo ?? "").trim()) continue;
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
