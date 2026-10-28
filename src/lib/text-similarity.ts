import { CATEGORY_LABEL, type Task } from "./types";
import { listActiveForExport } from "./sort";

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
  "하기",
  "하기요",
  "됨",
  "임",
  "음",
  "기",
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

/** Verbal-noun endings (longest first) — 「정리하기」→「정리」. */
const STRIP_ENDINGS = ["하기요", "시키기", "되기", "하기"] as const;

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
 * Strip Korean verbal-noun endings (~하기, ~~기) to a lexical stem.
 * Lone suffixes become empty (dropped by tokenize).
 */
export function stemKoreanToken(token: string): string {
  let t = token;
  for (const end of STRIP_ENDINGS) {
    if (t.length > end.length + 1 && t.endsWith(end)) {
      t = t.slice(0, -end.length);
      break;
    }
  }
  // Trailing light 「기」 on a ≥2-syllable stem (정리기-style / ~~기)
  if (
    t.length >= 3 &&
    t.endsWith("기") &&
    /[\uac00-\ud7a3]{2,}기$/.test(t)
  ) {
    const stem = t.slice(0, -1);
    // Only strip if stem still looks like content (not a real word ending in 기 like 악기)
    if (stem.length >= 2 && !TRIVIAL.has(stem)) {
      t = stem;
    }
  }
  return t;
}

/**
 * Split title/memo into meaningful lexical word tokens (Korean-friendly).
 * - No Hangul syllable bigrams
 * - Strips ~하기 / ~~기 verb endings so they never count as overlaps
 * - Drops particles / trivial stems
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
  for (const rawTok of raw) {
    if (TRIVIAL.has(rawTok)) continue;
    const t = stemKoreanToken(rawTok);
    if (!t || TRIVIAL.has(t)) continue;
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

/** Exact same content (title+memo) ignoring spaces/punctuation — for import block. */
export function isExactContentMatch(
  a: Pick<Task, "title" | "memo">,
  b: Pick<Task, "title" | "memo">,
): boolean {
  const na = normalizeCompact(`${a.title ?? ""}\n${a.memo ?? ""}`);
  const nb = normalizeCompact(`${b.title ?? ""}\n${b.memo ?? ""}`);
  if (!na || !nb) return false;
  return na === nb && na.length >= 2;
}

/**
 * Substantial wording overlap between two fields.
 * Father rule: alert only when **2+ real overlapping words** (after stem).
 * Exact-match is handled separately for import blocking.
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

  const ta = tokenizeMeaningful(a);
  const tb = tokenizeMeaningful(b);
  if (ta.length === 0 || tb.length === 0) {
    return { shared: [], score: 0, substantial: false };
  }
  const setB = new Set(tb);
  const shared = [...new Set(ta.filter((t) => setB.has(t)))];
  const union = new Set([...ta, ...tb]);
  const jaccard = shared.length / union.size;
  const strongShared = shared.filter((t) => t.length >= 2);

  // Exact compact match still counts as substantial (in-app warn); import blocks separately
  if (na === nb && na.length >= 4) {
    return {
      shared: strongShared.length ? strongShared : ta,
      score: 1,
      substantial: strongShared.length >= 2 || ta.length <= 1,
    };
  }

  // Require ≥2 real lexical overlaps — never a single shared stem/suffix
  let substantial = false;
  if (crossField) {
    substantial =
      strongShared.length >= 3 && jaccard >= 0.4;
  } else {
    substantial =
      strongShared.length >= 2 &&
      (jaccard >= 0.35 || strongShared.length >= 3);
  }

  return { shared: strongShared, score: jaccard, substantial };
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

/** Empty or placeholder-only title (「새 할일」, 「할 일」, whitespace…). */
export function isPlaceholderTitle(title: string): boolean {
  const t = title.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return true;
  if (PLACEHOLDER_TITLES.has(title.trim()) || PLACEHOLDER_TITLES.has(t)) {
    return true;
  }
  return false;
}

/**
 * Meaningful 할 일 for briefing (email + Excel 「브리핑요약」):
 * requires a real title. Empty / placeholder title → false even if memo has text.
 */
export function hasMeaningfulTaskContent(
  task: Pick<Task, "title" | "memo">,
): boolean {
  return !isPlaceholderTitle(task.title ?? "");
}

/**
 * Active unfinished peers with similar title/memo (2+ lexical words).
 * Excludes self by id — same-row title∩memo never triggers.
 */
export function findSimilarActiveTasks(
  candidate: Pick<Task, "title" | "memo">,
  tasks: readonly Task[],
  excludeId?: string,
): SimilarityHit[] {
  const title = (candidate.title ?? "").trim();
  const memo = (candidate.memo ?? "").trim();
  if (!title && !memo) return [];
  if (isPlaceholderTitle(title) && !memo) return [];
  const blob = `${title}${memo}`;
  if (normalizeCompact(blob).length < 4) return [];

  const hits: SimilarityHit[] = [];
  for (const t of tasks) {
    if (excludeId != null && t.id === excludeId) continue;
    if (t.status !== "active") continue;
    if (isPlaceholderTitle(t.title) && !(t.memo ?? "").trim()) continue;
    const { shared, score, substantial } = crossFieldSimilarity(candidate, t);
    if (!substantial) continue;
    // Enforce 2+ shared tokens even for exact compact path with short titles
    if (shared.length < 2 && !isExactContentMatch(candidate, t)) continue;
    hits.push({ task: t, sharedTokens: shared, score });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score || b.sharedTokens.length - a.sharedTokens.length,
  );
  return hits;
}

/** Peers with exact same title+memo (import must block these). */
export function findExactDuplicateTasks(
  candidate: Pick<Task, "title" | "memo">,
  tasks: readonly Task[],
  excludeId?: string,
): Task[] {
  const title = (candidate.title ?? "").trim();
  const memo = (candidate.memo ?? "").trim();
  if (!title && !memo) return [];
  if (isPlaceholderTitle(title) && !memo) return [];
  return tasks.filter((t) => {
    if (excludeId != null && t.id === excludeId) return false;
    if (t.status !== "active") return false;
    return isExactContentMatch(candidate, t);
  });
}

/**
 * 1-based order of a task inside its 틀 list (newest-first + 지난 일정 sink),
 * matching the Excel/app「순서」column when viewing that frame.
 */
export function orderInFrame(
  task: Task,
  allActive: readonly Task[],
): number {
  const frameList = listActiveForExport(
    allActive.filter((t) => t.category === task.category),
  );
  const idx = frameList.findIndex((t) => t.id === task.id);
  return idx >= 0 ? idx + 1 : 0;
}

/** One peer location line: 틀 · 행 번호 · 제목 · 겹친 말. */
export function describeSimilarityHit(
  hit: SimilarityHit,
  allActive: readonly Task[],
): string {
  const frame = CATEGORY_LABEL[hit.task.category];
  const order = orderInFrame(hit.task, allActive);
  const title = hit.task.title.trim() || "(제목 없음)";
  const where =
    order > 0
      ? `「${frame}」 ${order}번 행 「${title}」`
      : `「${frame}」 「${title}」`;
  const shared = hit.sharedTokens.slice(0, 5).join(", ");
  if (shared) return `${where} — 겹친 말: ${shared}`;
  return where;
}

/**
 * Short polished Korean copy for in-app alert.
 * Includes which 틀 / 행 / overlapped words so father can find the peer.
 */
export function buildSimilarityAlertMessage(
  hits: SimilarityHit[],
  allActive?: readonly Task[],
): string | null {
  if (hits.length === 0) return null;
  const peers = allActive ?? hits.map((h) => h.task);
  const primary = describeSimilarityHit(hits[0], peers);
  if (hits.length === 1) {
    return `비슷한 할 일이 있습니다: ${primary}`;
  }
  if (hits.length === 2) {
    const second = describeSimilarityHit(hits[1], peers);
    return `비슷한 할 일이 있습니다:\n· ${primary}\n· ${second}`;
  }
  const extra = hits.length - 1;
  return `비슷한 할 일이 있습니다: ${primary}\n(같은 내용 ${extra}건 더)`;
}
