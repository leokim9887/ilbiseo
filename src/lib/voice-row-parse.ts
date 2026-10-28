/**
 * Parse one-shot Korean speech for 「행 추가」 fields.
 * Prefer freeform + confirm UI; heuristics are best-effort.
 */

import { todayIsoKst } from "./date-range";
import { clampPriority } from "./priority";
import {
  CATEGORY_LABEL,
  type TaskCategory,
  type TaskKind,
} from "./types";

export type VoiceDeadlineKind = "range" | "same-day" | "someday" | "unset";

export type VoiceParsedFields = {
  title: string;
  memo: string;
  /** Spoken 틀 label if detected (UI still uses current frame). */
  spokenCategory: TaskCategory | null;
  startDate: string | null;
  targetDate: string | null;
  kind: TaskKind;
  importance: number;
  deadlineKind: VoiceDeadlineKind;
  /** Field keys that look incomplete / guessed. */
  uncertain: Array<"title" | "memo" | "deadline" | "importance">;
  /** Human-readable deadline for confirm UI. */
  deadlineLabel: string;
};

export type ParseVoiceRowOptions = {
  today?: string;
  /** Current year for bare month/day (defaults from today). */
  defaultYear?: number;
};

const FRAME_ALIASES: Array<{ cat: TaskCategory; patterns: RegExp[] }> = (
  Object.entries(CATEGORY_LABEL) as [TaskCategory, string][]
).map(([cat, label]) => {
  const stem = label.replace(/용$/, "");
  return {
    cat,
    patterns: [
      new RegExp(`^${label}\\s*(?:에|에서|으로|로)?\\s*`),
      new RegExp(`^${stem}\\s*(?:에|에서|으로|로|용에|용에서)?\\s*`),
    ],
  };
});

const IMPORTANCE_MARK = /중요도|우선순위|우선\s*순위/;
const MEMO_MARK = /메모|비고/;
const DEADLINE_MARK = /마감목표|마감\s*목표|마감|기한|데드라인/;

function isoFromYmd(
  y: string | number,
  m: string | number,
  d: string | number,
): string | null {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (
    !Number.isFinite(yy) ||
    !Number.isFinite(mm) ||
    !Number.isFinite(dd) ||
    mm < 1 ||
    mm > 12 ||
    dd < 1 ||
    dd > 31
  ) {
    return null;
  }
  const year = yy < 100 ? 2000 + yy : yy;
  if (year < 1990 || year > 2100) return null;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** One calendar day from spoken Korean / numeric forms. */
export function parseSpokenDate(
  raw: string,
  defaultYear: number,
  today: string,
): string | null {
  const s = raw.replace(/\u00a0/g, " ").trim();
  if (!s) return null;

  if (/^(오늘|당일|금일)$/.test(s)) return today;

  if (/^(내일)$/.test(s)) {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(y, m - 1, d + 1);
    return isoFromYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }

  const koY = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (koY) return isoFromYmd(koY[1], koY[2], koY[3]);

  const ko = s.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (ko) return isoFromYmd(defaultYear, ko[1], ko[2]);

  const iso = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (iso) return isoFromYmd(iso[1], iso[2], iso[3]);

  const md = s.match(/^(\d{1,2})[./-](\d{1,2})$/);
  if (md) return isoFromYmd(defaultYear, md[1], md[2]);

  return null;
}

function parseImportanceToken(raw: string): number | null {
  const s = raw.replace(/\s+/g, "").trim();
  if (!s) return null;
  if (/^(3|높음|높은|상|중요|최우선|급함|급함함|하이)$/.test(s)) return 3;
  if (/^(2|보통|중간|중|노멀)$/.test(s)) return 2;
  if (/^(1|낮음|낮은|하|여유)$/.test(s)) return 1;
  const n = Number(s);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

type Slice = { rest: string; value: string | null; found: boolean };

function takeMarkedTail(text: string, mark: RegExp): Slice {
  const m = text.match(mark);
  if (!m || m.index == null) {
    return { rest: text, value: null, found: false };
  }
  const before = text.slice(0, m.index).trim();
  const after = text.slice(m.index + m[0].length).trim();
  // Stop at next field mark inside after
  const stop = after.search(
    new RegExp(
      `(?:${IMPORTANCE_MARK.source}|${MEMO_MARK.source}|${DEADLINE_MARK.source})`,
    ),
  );
  if (stop < 0) {
    return { rest: before, value: after || null, found: true };
  }
  return {
    rest: `${before} ${after.slice(stop)}`.trim(),
    value: after.slice(0, stop).trim() || null,
    found: true,
  };
}

function stripSpokenFrame(title: string): {
  title: string;
  spokenCategory: TaskCategory | null;
} {
  let t = title.trim();
  for (const { cat, patterns } of FRAME_ALIASES) {
    for (const re of patterns) {
      if (re.test(t)) {
        t = t.replace(re, "").trim();
        return { title: t, spokenCategory: cat };
      }
    }
  }
  return { title: t, spokenCategory: null };
}

function parseDeadlineSpeech(
  raw: string | null,
  today: string,
  defaultYear: number,
  found: boolean,
): Pick<
  VoiceParsedFields,
  "startDate" | "targetDate" | "kind" | "deadlineKind" | "deadlineLabel"
> & { deadlineUncertain: boolean } {
  if (!found || raw == null || !raw.trim()) {
    // Default like 「행 추가」: today–today spot
    return {
      startDate: today,
      targetDate: today,
      kind: "spot",
      deadlineKind: "unset",
      deadlineLabel: "오늘 (기본)",
      deadlineUncertain: false,
    };
  }

  const s = raw.replace(/\u00a0/g, " ").trim();

  if (/언젠가|기한\s*없음|무기한/.test(s)) {
    return {
      startDate: null,
      targetDate: null,
      kind: "someday",
      deadlineKind: "someday",
      deadlineLabel: "언젠가",
      deadlineUncertain: false,
    };
  }

  if (/^(오늘|당일|금일)(\s*(하루|하루만|만))?$/.test(s)) {
    return {
      startDate: today,
      targetDate: today,
      kind: "spot",
      deadlineKind: "same-day",
      deadlineLabel: today,
      deadlineUncertain: false,
    };
  }

  // 「10월 30일부터 11월 2일」 / 「10월 30일 ~ 11월 2일」 / 「부터 … 까지」
  const range =
    s.match(
      /^(.+?)\s*(?:부터|~|～|〜|–|—)\s*(.+?)(?:\s*까지)?$/,
    ) || s.match(/^(.+?)\s+까지$/);

  if (range && range[2] !== undefined) {
    const start = parseSpokenDate(range[1], defaultYear, today);
    const end = parseSpokenDate(range[2], defaultYear, today);
    if (start && end) {
      const a = start <= end ? start : end;
      const b = start <= end ? end : start;
      const same = a === b;
      return {
        startDate: a,
        targetDate: b,
        kind: same ? "spot" : "ongoing",
        deadlineKind: same ? "same-day" : "range",
        deadlineLabel: same ? a : `${a} ~ ${b}`,
        deadlineUncertain: false,
      };
    }
    return {
      startDate: today,
      targetDate: today,
      kind: "spot",
      deadlineKind: "unset",
      deadlineLabel: s,
      deadlineUncertain: true,
    };
  }

  // until-only: 「11월 2일까지」
  const until = s.match(/^(.+?)\s*까지$/);
  if (until) {
    const end = parseSpokenDate(until[1], defaultYear, today);
    if (end) {
      if (end < today) {
        return {
          startDate: end,
          targetDate: end,
          kind: "spot",
          deadlineKind: "same-day",
          deadlineLabel: end,
          deadlineUncertain: false,
        };
      }
      const start = today;
      const same = start === end;
      return {
        startDate: start,
        targetDate: end,
        kind: same ? "spot" : "ongoing",
        deadlineKind: same ? "same-day" : "range",
        deadlineLabel: same ? start : `${start} ~ ${end}`,
        deadlineUncertain: false,
      };
    }
  }

  const single = parseSpokenDate(s, defaultYear, today);
  if (single) {
    return {
      startDate: single,
      targetDate: single,
      kind: "spot",
      deadlineKind: "same-day",
      deadlineLabel: single,
      deadlineUncertain: false,
    };
  }

  return {
    startDate: today,
    targetDate: today,
    kind: "spot",
    deadlineKind: "unset",
    deadlineLabel: s || "오늘 (기본)",
    deadlineUncertain: true,
  };
}

/**
 * Parse freeform Korean speech into task fields.
 *
 * Example:
 * 「업무용에 보고서 쓰기 메모 급함 마감 10월 30일부터 11월 2일 중요도 높음」
 */
export function parseVoiceRowAdd(
  transcript: string,
  options?: ParseVoiceRowOptions,
): VoiceParsedFields {
  const today = options?.today ?? todayIsoKst();
  const defaultYear =
    options?.defaultYear ?? Number.parseInt(today.slice(0, 4), 10);

  let text = transcript
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const uncertain: VoiceParsedFields["uncertain"] = [];

  // Extract from the end-ish markers so title stays clean
  const impSlice = takeMarkedTail(text, IMPORTANCE_MARK);
  text = impSlice.rest;
  let importance = 2;
  if (impSlice.found) {
    const parsed = parseImportanceToken(impSlice.value ?? "");
    if (parsed == null) {
      uncertain.push("importance");
      // 「급함」 sometimes lands in memo — also try raw
      importance = 2;
    } else {
      importance = parsed;
    }
  }

  const dlSlice = takeMarkedTail(text, DEADLINE_MARK);
  text = dlSlice.rest;
  const deadline = parseDeadlineSpeech(
    dlSlice.value,
    today,
    defaultYear,
    dlSlice.found,
  );
  if (deadline.deadlineUncertain) uncertain.push("deadline");

  const memoSlice = takeMarkedTail(text, MEMO_MARK);
  text = memoSlice.rest;
  let memo = (memoSlice.value ?? "").trim();

  // Soft: 「급함」 without 메모 marker → treat as memo if title otherwise plain
  if (!memoSlice.found && /\s급함$/.test(text)) {
    text = text.replace(/\s급함$/, "").trim();
    memo = "급함";
  }

  const { title: stripped, spokenCategory } = stripSpokenFrame(text);
  let title = stripped
    .replace(/^(할\s*일|제목)\s*/i, "")
    .trim();

  // Importance word stuck in title without marker
  if (!impSlice.found) {
    const inlineImp = title.match(
      /\s*(?:중요도\s*)?(높음|보통|낮음|최우선|중요)\s*$/,
    );
    if (inlineImp) {
      const n = parseImportanceToken(inlineImp[1]);
      if (n != null) {
        importance = n;
        title = title.slice(0, inlineImp.index).trim();
      }
    }
  }

  if (!title) uncertain.push("title");

  return {
    title,
    memo,
    spokenCategory,
    startDate: deadline.startDate,
    targetDate: deadline.targetDate,
    kind: deadline.kind,
    importance: clampPriority(importance, 2),
    deadlineKind: deadline.deadlineKind,
    uncertain,
    deadlineLabel: deadline.deadlineLabel,
  };
}

/** Whether confirm UI should highlight “please check”. */
export function voiceParseNeedsConfirm(parsed: VoiceParsedFields): boolean {
  return parsed.uncertain.length > 0 || !parsed.title.trim();
}
