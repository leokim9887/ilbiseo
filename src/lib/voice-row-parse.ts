/**
 * Parse one-shot Korean speech for 「행 추가」 fields.
 * Prefer freeform + confirm UI; heuristics tolerate missing spaces
 * (common from mobile SpeechRecognition).
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
  /** Spoken 틀 label if detected (UI picker can override). */
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

const KO_DIGITS: Record<string, string> = {
  영: "0",
  공: "0",
  일: "1",
  하나: "1",
  이: "2",
  둘: "2",
  삼: "3",
  셋: "3",
  사: "4",
  넷: "4",
  오: "5",
  다섯: "5",
  육: "6",
  여섯: "6",
  칠: "7",
  일곱: "7",
  팔: "8",
  여덟: "8",
  구: "9",
  아홉: "9",
  십: "10",
  열: "10",
};

function koNumeralToAscii(raw: string): string {
  let s = raw;
  // 십일~십구, 이십~구십 + optional ones
  s = s.replace(
    /(이|삼|사|오|육|칠|팔|구)?십(일|이|삼|사|오|육|칠|팔|구)?/g,
    (_, tens?: string, ones?: string) => {
      const t = tens ? Number(KO_DIGITS[tens] ?? "0") * 10 : 10;
      const o = ones ? Number(KO_DIGITS[ones] ?? "0") : 0;
      return String(t + o);
    },
  );
  s = s.replace(/열(한|둘|셋|넷|다섯|여섯|일곱|여덟|아홉)?/g, (_, ones?: string) => {
    const map: Record<string, number> = {
      한: 1,
      둘: 2,
      셋: 3,
      넷: 4,
      다섯: 5,
      여섯: 6,
      일곱: 7,
      여덟: 8,
      아홉: 9,
    };
    return String(10 + (ones ? map[ones] ?? 0 : 0));
  });
  return s;
}

/**
 * Mobile STT often glues markers: 「보고서쓰기메모급함마감10월…중요도높음」.
 * Insert spaces around known field markers / range words.
 */
export function normalizeVoiceTranscript(raw: string): string {
  let s = raw.replace(/\u00a0/g, " ").trim();
  s = koNumeralToAscii(s);
  s = s
    .replace(/마감\s*목표/g, "마감목표")
    .replace(
      /(할\s*일|제목|메모|비고|마감목표|마감|기한|데드라인|중요도|우선순위)/g,
      " $1 ",
    )
    .replace(/(부터|까지)/g, " $1 ")
    .replace(/([0-9]+)\s*월/g, " $1월 ")
    .replace(/([0-9]+)\s*일/g, " $1일 ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

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
  const s = normalizeVoiceTranscript(raw);
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
  if (/^(3|높음|높은|상|중요|최우선|급함|하이|하이임)$/.test(s)) return 3;
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
  const stop = after.search(
    /(?:중요도|우선순위|우선\s*순위|메모|비고|마감목표|마감\s*목표|마감|기한|데드라인)/,
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
  if (!found || raw == null || !String(raw).trim()) {
    return {
      startDate: today,
      targetDate: today,
      kind: "spot",
      deadlineKind: "unset",
      deadlineLabel: "오늘 (기본)",
      deadlineUncertain: false,
    };
  }

  const s = normalizeVoiceTranscript(raw);

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

  // 「10월 30일부터 11월 2일」 / 「10월 30일 ~ 11월 2일」
  const range = s.match(
    /^(.+?)\s*(?:부터|~|～|〜|–|—)\s*(.+?)(?:\s*까지)?$/,
  );

  if (range) {
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

  let text = normalizeVoiceTranscript(transcript);
  const uncertain: VoiceParsedFields["uncertain"] = [];

  const impSlice = takeMarkedTail(text, /중요도|우선순위|우선\s*순위/);
  text = impSlice.rest;
  let importance = 2;
  let importanceFound = impSlice.found;
  if (impSlice.found) {
    const parsed = parseImportanceToken(impSlice.value ?? "");
    if (parsed == null) {
      uncertain.push("importance");
      importance = 2;
    } else {
      importance = parsed;
    }
  }

  const dlSlice = takeMarkedTail(text, /마감목표|마감\s*목표|마감|기한|데드라인/);
  text = dlSlice.rest;
  let deadline = parseDeadlineSpeech(
    dlSlice.value,
    today,
    defaultYear,
    dlSlice.found,
  );
  if (deadline.deadlineUncertain) uncertain.push("deadline");

  const memoSlice = takeMarkedTail(text, /메모|비고/);
  text = memoSlice.rest;
  let memo = (memoSlice.value ?? "").trim();

  // Soft: trailing urgency word without 메모 marker
  if (!memoSlice.found) {
    const soft = text.match(/\s(급함|급해요|서둘러|긴급)$/);
    if (soft) {
      text = text.slice(0, soft.index).trim();
      memo = soft[1];
    }
  }

  // Inline date range still sitting in title (no 마감 marker)
  if (!dlSlice.found) {
    const inlineRange = text.match(
      /(.+?)\s+(\d{1,2}\s*월\s*\d{1,2}\s*일?(?:\s*부터\s*|\s*[~～〜]\s*)\d{1,2}\s*월\s*\d{1,2}\s*일?)\s*$/,
    );
    const inlineSomeday = text.match(/(.+?)\s+언젠가\s*$/);
    const inlineToday = text.match(/(.+?)\s+(오늘|당일|금일)\s*$/);
    if (inlineRange) {
      text = inlineRange[1].trim();
      deadline = parseDeadlineSpeech(inlineRange[2], today, defaultYear, true);
      if (deadline.deadlineUncertain) uncertain.push("deadline");
    } else if (inlineSomeday) {
      text = inlineSomeday[1].trim();
      deadline = parseDeadlineSpeech("언젠가", today, defaultYear, true);
    } else if (inlineToday) {
      text = inlineToday[1].trim();
      deadline = parseDeadlineSpeech(inlineToday[2], today, defaultYear, true);
    }
  }

  const { title: stripped, spokenCategory } = stripSpokenFrame(text);
  let title = stripped.replace(/^(할\s*일|제목)\s*/i, "").trim();

  if (!importanceFound) {
    const inlineImp = title.match(
      /\s*(?:중요도\s*)?(높음|보통|낮음|최우선|중요)\s*$/,
    );
    if (inlineImp) {
      const n = parseImportanceToken(inlineImp[1]);
      if (n != null) {
        importance = n;
        importanceFound = true;
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
