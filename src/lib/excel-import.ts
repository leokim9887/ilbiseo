import * as XLSX from "xlsx";
import { todayIsoKst } from "./date-range";
import { createId } from "./id";
import { clampPriority } from "./priority";
import { inferGroupKey } from "./sort";
import {
  findExactDuplicateTasks,
  findSimilarActiveTasks,
  buildSimilarityAlertMessage,
  type SimilarityHit,
} from "./text-similarity";
import {
  CATEGORY_LABEL,
  parseTaskCategory,
  type SideListItem,
  type SideListKind,
  type Task,
  type TaskCategory,
  type TaskKind,
} from "./types";

/** 일비서 칸 — 아빠 엑셀 열을 여기에 맞춥니다. */
export type ImportField =
  | "title"
  | "memo"
  | "deadline"
  | "importance"
  /** @deprecated 시급성 UI 제거 — 예전 저장 매핑·타입 호환만 */
  | "urgency"
  | "done"
  | "category"
  | "skip";

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  title: "할 일",
  memo: "메모",
  deadline: "마감목표",
  importance: "중요도",
  urgency: "시급성",
  done: "완료여부",
  category: "틀",
  skip: "안 씀",
};

/** 매핑 UI「우리 칸」옵션 (시급성 제외 — 예전 파일 열은 자동 skip) */
export type ImportTargetField = Exclude<ImportField, "skip" | "urgency">;

export const IMPORT_TARGET_FIELDS: ImportTargetField[] = [
  "title",
  "memo",
  "deadline",
  "importance",
  "done",
  "category",
];

export function isImportTargetField(
  field: ImportField,
): field is ImportTargetField {
  return (IMPORT_TARGET_FIELDS as readonly string[]).includes(field);
}

/** 예전 엑셀「시급성」열 별칭 — 자동 매핑 시 무시(skip) */
const URGENCY_HEADER_ALIASES = ["시급성", "시급", "urgency", "긴급"];

const HEADER_ALIASES: Record<ImportTargetField, string[]> = {
  title: [
    "할일 list up",
    "할일list up",
    "할일 listup",
    "할일listup",
    "할일 list",
    "할 일",
    "할일",
    "할일명",
    "업무명",
    "업무",
    "항목",
    "제목",
    "내용",
    "list up",
    "listup",
    "title",
    "todo",
    "task",
  ],
  memo: ["메모", "memo", "notes", "비고", "설명", "상세"],
  deadline: [
    "마감목표",
    "마감",
    "기한",
    "목표일",
    "목표",
    "deadline",
    "due",
    "date",
    "날짜",
    "기간",
  ],
  importance: ["중요도", "중요", "importance", "priority"],
  // 「할 일」시트에서는 완료여부 열 제거 — 예전 파일만 skip
  done: ["완료여부", "완료", "done", "status", "상태", "끝", "끝?"],
  category: ["틀", "분류", "category", "frame", "카테고리"],
};

/** 지침/습관 시트 「내용」열 */
const SIDE_TITLE_ALIASES = ["내용", "할일", "할 일", "항목", "제목", "title"];

/** Coerce deprecated urgency mappings to skip (saved localStorage / old flows). */
export function sanitizeMapping(mapping: ColumnMapping): ColumnMapping {
  const out: ColumnMapping = {};
  for (const [h, f] of Object.entries(mapping)) {
    out[h] = f === "urgency" ? "skip" : f;
  }
  return out;
}

export const MAPPING_STORAGE_KEY = "ilbiseo-excel-column-map-v1";

export type ColumnMapping = Record<string, ImportField>;

export type ParsedSheet = {
  name: string;
  headers: string[];
  /** raw row objects keyed by header */
  rows: Record<string, unknown>[];
};

export type ParsedWorkbook = {
  fileName: string;
  sheets: ParsedSheet[];
};

/** Sheets father may import — everything else is hidden. */
export const IMPORT_SHEET_ALLOWLIST = ["할 일", "지침", "습관"] as const;
export type ImportableSheetName = (typeof IMPORT_SHEET_ALLOWLIST)[number];

export type ImportSheetKind = "todo" | "guideline" | "habit";

export function classifyImportSheet(name: string): ImportSheetKind | null {
  const n = name.replace(/\s+/g, " ").trim();
  if (n === "할 일" || n === "할일") return "todo";
  if (n === "지침") return "guideline";
  if (n === "습관") return "habit";
  return null;
}

export function isAllowedImportSheet(name: string): boolean {
  return classifyImportSheet(name) != null;
}

/** Delta vs current in-app data (program is default truth). */
export type ImportDeltaKind =
  | "new"
  | "changed"
  | "unchanged"
  | "exact_block"
  | "empty";

export type MappedPreviewRow = {
  title: string;
  memo: string;
  deadlineLabel: string;
  importance: number;
  done: boolean;
  category: TaskCategory;
  categoryLabel: string;
  startDate: string | null;
  targetDate: string | null;
  kind: TaskKind;
  /** empty / unchanged / exact_block → not applied as add */
  skip: boolean;
  exactDuplicate: boolean;
  delta: ImportDeltaKind;
  /** Existing task/side id to update when delta=changed */
  matchId: string | null;
  similarHits: SimilarityHit[];
};

function compactKey(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Match key: title + 틀 — edits update the same row rather than always appending. */
export function taskMatchKey(
  title: string,
  category: TaskCategory,
): string {
  return `${compactKey(title)}|${category}`;
}

/** Full content fingerprint — unchanged if equal. */
export function taskContentKey(partial: {
  title: string;
  memo: string;
  category: TaskCategory;
  startDate: string | null;
  targetDate: string | null;
  importance: number;
}): string {
  return [
    compactKey(partial.title),
    partial.category,
    partial.startDate ?? "",
    partial.targetDate ?? "",
    String(partial.importance),
    compactKey(partial.memo ?? ""),
  ].join("|");
}

export function sideMatchKey(title: string): string {
  return compactKey(title);
}

export function sideContentKey(title: string, memo: string): string {
  return `${compactKey(title)}|${compactKey(memo ?? "")}`;
}

export function summarizeDeltaCounts(preview: MappedPreviewRow[]): {
  neu: number;
  changed: number;
  unchanged: number;
  blocked: number;
  message: string;
} {
  const neu = preview.filter((r) => r.delta === "new").length;
  const changed = preview.filter((r) => r.delta === "changed").length;
  const unchanged = preview.filter((r) => r.delta === "unchanged").length;
  const blocked = preview.filter((r) => r.delta === "exact_block").length;
  const parts: string[] = [];
  if (neu) parts.push(`새 ${neu}건`);
  if (changed) parts.push(`바뀐 ${changed}건`);
  // Preview table omits unchanged rows — keep a short skip note only
  if (unchanged) parts.push(`그대로 ${unchanged}건은 생략`);
  if (blocked) parts.push(`같은 내용 ${blocked}건 제외`);
  return {
    neu,
    changed,
    unchanged,
    blocked,
    message: parts.length ? parts.join(" · ") : "가져올 변경 없음",
  };
}

/** True when mapping includes an Excel 「틀」 column. */
export function mappingHasCategory(mapping: ColumnMapping): boolean {
  return Object.values(sanitizeMapping(mapping)).includes("category");
}

/**
 * Father-visible summary for 2+ word overlaps only (exact dupes are blocked, not alerted here).
 */
export function summarizeImportSimilarities(
  preview: MappedPreviewRow[],
): { count: number; message: string } | null {
  const withHits = preview.filter(
    (r) => !r.skip && !r.exactDuplicate && r.similarHits.length > 0,
  );
  if (withHits.length === 0) return null;
  const sample = withHits[0];
  const peerMsg = buildSimilarityAlertMessage(sample.similarHits);
  if (withHits.length === 1 && peerMsg) {
    return {
      count: 1,
      message: `비슷한 할 일 ${withHits.length}건 — ${peerMsg.replace(/^비슷한 할 일이 있습니다:\s*/, "")}`,
    };
  }
  return {
    count: withHits.length,
    message: `비슷한 할 일 ${withHits.length}건이 이미 있습니다. 아래 미리보기에서 확인한 뒤 추가하세요.`,
  };
}

export function summarizeExactBlocks(
  preview: MappedPreviewRow[],
): { count: number; message: string } | null {
  // Only cross-틀 exact blocks — unchanged (same title+틀) is covered by delta summary
  const blocked = preview.filter((r) => r.delta === "exact_block");
  if (blocked.length === 0) return null;
  return {
    count: blocked.length,
    message: `같은 내용 ${blocked.length}건은 이미 있어서 넣지 않습니다.`,
  };
}

function normalizeHeader(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Exact 일비서 export headers (normalized). */
const TEMPLATE_TITLE_HEADERS = new Set([
  "할일 list up",
  "할일list up",
  "할일 listup",
]);

export function suggestFieldForHeader(
  header: string,
  sheetKind: ImportSheetKind = "todo",
): ImportField {
  const n = normalizeHeader(header);
  if (!n) return "skip";
  // 순서 열은 무시
  if (n === "순서" || n === "순" || n === "no" || n === "#") return "skip";
  // 시급성 열은 조용히 무시 (예전 파일 호환)
  if (
    URGENCY_HEADER_ALIASES.some(
      (a) => n === a || n.includes(a) || a.includes(n),
    )
  ) {
    return "skip";
  }
  // 완료여부 열은 할 일·한 일·지침·습관 모두 사용 안 함 (예전 파일 skip)
  if (n === "완료여부" || n === "완료" || n === "done" || n === "status") {
    return "skip";
  }
  // Prefer exact template match for title
  if (TEMPLATE_TITLE_HEADERS.has(n) || n === "할 일" || n === "할일") {
    return "title";
  }
  if (sheetKind !== "todo") {
    if (SIDE_TITLE_ALIASES.some((a) => n === a || n.includes(a))) {
      return "title";
    }
  }
  for (const field of IMPORT_TARGET_FIELDS) {
    // Side sheets: ignore deadline/importance/category
    if (
      sheetKind !== "todo" &&
      (field === "deadline" ||
        field === "importance" ||
        field === "category")
    ) {
      continue;
    }
    const aliases = HEADER_ALIASES[field];
    if (
      aliases.some(
        (a: string) => n === a || n.includes(a) || a.includes(n),
      )
    ) {
      return field;
    }
  }
  return "skip";
}

export function autoMapHeaders(
  headers: string[],
  sheetKind: ImportSheetKind = "todo",
): ColumnMapping {
  const used = new Set<ImportField>();
  const mapping: ColumnMapping = {};
  for (const h of headers) {
    const suggested = suggestFieldForHeader(h, sheetKind);
    if (suggested !== "skip" && used.has(suggested)) {
      mapping[h] = "skip";
      continue;
    }
    if (suggested !== "skip") used.add(suggested);
    mapping[h] = suggested;
  }
  return sanitizeMapping(mapping);
}

/** True when headers look like 일비서 export/template (exact classic names). */
export function isIlbiseoTemplate(headers: string[]): boolean {
  const norms = headers.map(normalizeHeader);
  const hasListUp = norms.some(
    (n) =>
      n === "할일 list up" ||
      n === "할일list up" ||
      n === "할일 listup" ||
      n === "할일listup",
  );
  const hasDeadline = norms.some((n) => n === "마감목표");
  const hasImportance = norms.some((n) => n === "중요도");
  // 시급성 불필요 — 새 양식·예전 양식(시급성 있어도 중요도만으로 일치)
  return hasListUp && hasDeadline && hasImportance;
}

export function loadSavedMapping(): ColumnMapping | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ColumnMapping;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMapping(mapping: ColumnMapping): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      MAPPING_STORAGE_KEY,
      JSON.stringify(sanitizeMapping(mapping)),
    );
  } catch {
    /* ignore quota */
  }
}

/**
 * Merge saved mapping onto current headers: match by normalized header name.
 * Unmatched headers fall back to auto-map.
 */
export function applySavedOrAuto(
  headers: string[],
  saved: ColumnMapping | null,
  sheetKind: ImportSheetKind = "todo",
): ColumnMapping {
  const auto = autoMapHeaders(headers, sheetKind);
  if (!saved) return auto;
  const cleaned = sanitizeMapping(saved);
  const byNorm = new Map<string, ImportField>();
  for (const [k, v] of Object.entries(cleaned)) {
    byNorm.set(normalizeHeader(k), v);
  }
  const used = new Set<ImportField>();
  const out: ColumnMapping = {};
  for (const h of headers) {
    const fromSaved = byNorm.get(normalizeHeader(h));
    if (
      fromSaved &&
      fromSaved !== "skip" &&
      isImportTargetField(fromSaved) &&
      !used.has(fromSaved)
    ) {
      out[h] = fromSaved;
      used.add(fromSaved);
    } else if (fromSaved === "skip") {
      out[h] = "skip";
    } else {
      const a = auto[h] ?? "skip";
      if (a !== "skip" && used.has(a)) {
        out[h] = "skip";
      } else {
        out[h] = a;
        if (a !== "skip") used.add(a);
      }
    }
  }
  return sanitizeMapping(out);
}

/** Excel serial → YYYY-MM-DD (SheetJS SSF). */
function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  try {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed && parsed.y) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Date → YYYY-MM-DD without TZ off-by-one.
 * Prefer reconstructing the Excel serial (absolute calendar day) when possible;
 * fall back to local YMD (father’s typed day) then UTC midnight export style.
 */
export function dateToIsoCalendar(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  // Reconstruct Excel serial from epoch 1899-12-30 UTC — timezone-independent
  const excelEpoch = Date.UTC(1899, 11, 30);
  const serial = Math.round((d.getTime() - excelEpoch) / 86400000);
  if (serial > 20000 && serial < 80000) {
    const fromSerial = excelSerialToIso(serial);
    if (fromSerial) return fromSerial;
  }
  const utcMid =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0;
  if (utcMid) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    return dateToIsoCalendar(v) ?? "";
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const iso = excelSerialToIso(v);
    if (iso) return iso;
    return String(v);
  }
  const s = String(v).trim();
  // sheet_to_json(raw:false) may stringify serials — recover them
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const iso = excelSerialToIso(Number(s));
    if (iso) return iso;
  }
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
  // 2-digit year → 2000–2099 (father Excel locale m/d/yy)
  const year = yy < 100 ? 2000 + yy : yy;
  if (year < 1990 || year > 2100) return null;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Parse one calendar day from common Excel / father text forms.
 * @param defaultYear — year for bare `M/D` (KST “today” year when omitted)
 */
function parseOneDate(
  raw: string,
  defaultYear?: number,
): string | null {
  const s = raw.replace(/\u00a0/g, " ").trim();
  if (!s) return null;

  // ISO datetime from SheetJS raw Date stringification
  const isoDt = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/,
  );
  if (isoDt) return isoFromYmd(isoDt[1], isoDt[2], isoDt[3]);

  // 2026년 10월 17일
  const ko = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (ko) return isoFromYmd(ko[1], ko[2], ko[3]);

  // 2026-10-17 / 2026.10.17 / 2026/10/17 (optional spaces after sep)
  const ymd = s.match(
    /(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/,
  );
  if (ymd) return isoFromYmd(ymd[1], ymd[2], ymd[3]);

  // 10/17/2026 or 10/17/26 (US-style Excel locale)
  const mdy = s.match(
    /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})$/,
  );
  if (mdy) {
    const a = Number(mdy[1]);
    const b = Number(mdy[2]);
    const c = Number(mdy[3]);
    // If first part > 12, treat as D/M/Y; else M/D/Y (Excel US default)
    if (a > 12 && b <= 12) return isoFromYmd(c, b, a);
    return isoFromYmd(c, a, b);
  }

  // Father bare month/day: `10/19` / `10.19` — year = KST today (or injected)
  const md = s.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})$/);
  if (md) {
    const year =
      defaultYear ?? Number.parseInt(todayIsoKst().slice(0, 4), 10);
    return isoFromYmd(year, md[1], md[2]);
  }

  // Bare Excel serial
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));

  return null;
}

export type ParseDeadlineOptions = {
  /** Override “today” (YYYY-MM-DD, KST). Defaults to calendar today in Asia/Seoul. */
  today?: string;
};

/**
 * Parse 「마감목표」 from Excel export / father-edited cells.
 * Handles: Date serials, YYYY-MM-DD, ranges `A ~ B`, locale m/d/yy,
 * Korean 년월일, ISO datetime, father until-only `~M/D`.
 * Empty / 「언젠가」 → someday (no fake dates).
 *
 * Father until-only (`~M/D`, no start in the cell):
 * - end = date after `~` (year = KST current year unless present)
 * - if end ≥ today → start=today, end=tilde (open until that day)
 * - if end &lt; today → **single day = tilde date only** (never `과거 ~ 오늘` / `오늘 ~ 과거`)
 */
export function parseDeadline(
  raw: string,
  options?: ParseDeadlineOptions,
): {
  startDate: string | null;
  targetDate: string | null;
  kind: TaskKind;
  label: string;
} {
  const today = options?.today ?? todayIsoKst();
  const defaultYear = Number.parseInt(today.slice(0, 4), 10);
  const s = raw.replace(/\u00a0/g, " ").trim();
  if (!s || /^언젠가$/i.test(s) || /^someday$/i.test(s)) {
    return {
      startDate: null,
      targetDate: null,
      kind: "someday",
      label: "언젠가",
    };
  }

  // Range: start ~ end (various dashes / tildes; allow spaced dots)
  const rangeParts = s.split(/\s*[~～〜]\s*|\s+[–—]\s+/);
  if (rangeParts.length === 2) {
    const startRaw = rangeParts[0].trim();
    const endRaw = rangeParts[1].trim();
    const end = parseOneDate(endRaw, defaultYear);
    // Until-only: `~10/19` / `～10/30` — empty start
    if (end && !startRaw) {
      // Past tilde date → single calendar day (not expand to include today)
      if (end < today) {
        return {
          startDate: end,
          targetDate: end,
          kind: "spot",
          label: end,
        };
      }
      // end ≥ today → start = today (KST), end = tilde date
      const start = today;
      const kind: TaskKind = start === end ? "spot" : "ongoing";
      return {
        startDate: start,
        targetDate: end,
        kind,
        label: start === end ? start : `${start} ~ ${end}`,
      };
    }
    const start = parseOneDate(startRaw, defaultYear);
    if (start && end) {
      // Never keep inverted / today-padded past ranges from bad prior imports:
      // e.g. `2026-10-18 ~ 2026-10-19` or `2026-10-19 ~ 2026-10-18` when one side
      // is today and the other is past → collapse to the past single day.
      if (start !== end) {
        const a = start <= end ? start : end;
        const b = start <= end ? end : start;
        if (a < today && b === today) {
          return {
            startDate: a,
            targetDate: a,
            kind: "spot",
            label: a,
          };
        }
      }
      const kind: TaskKind = start === end ? "spot" : "ongoing";
      return {
        startDate: start,
        targetDate: end,
        kind,
        label: start === end ? start : `${start} ~ ${end}`,
      };
    }
  }

  // Also: 2026-10-17 - 2026-10-20 (hyphen between full dates)
  const hyphenRange = s.match(
    /^(.+?)\s+-\s+(.+)$/,
  );
  if (hyphenRange) {
    const start = parseOneDate(hyphenRange[1], defaultYear);
    const end = parseOneDate(hyphenRange[2], defaultYear);
    if (start && end) {
      if (start !== end) {
        const a = start <= end ? start : end;
        const b = start <= end ? end : start;
        if (a < today && b === today) {
          return {
            startDate: a,
            targetDate: a,
            kind: "spot",
            label: a,
          };
        }
      }
      const kind: TaskKind = start === end ? "spot" : "ongoing";
      return {
        startDate: start,
        targetDate: end,
        kind,
        label: start === end ? start : `${start} ~ ${end}`,
      };
    }
  }

  const single = parseOneDate(s, defaultYear);
  if (single) {
    return {
      startDate: single,
      targetDate: single,
      kind: "spot",
      label: single,
    };
  }

  // Unparsed text — treat as someday, keep label for display
  return {
    startDate: null,
    targetDate: null,
    kind: "someday",
    label: s || "언젠가",
  };
}

function parseDone(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return false;
  if (/^(완료|done|y|yes|true|o|ㅇ|✓|✔|v|1)$/i.test(s)) return true;
  if (/완료/.test(s)) return true;
  return false;
}

function splitListUp(raw: string): { title: string; memo: string } {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { title: "", memo: "" };
  if (lines.length === 1) return { title: lines[0], memo: "" };
  return { title: lines[0], memo: lines.slice(1).join("\n") };
}

export function buildPreviewRows(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  defaultCategory: TaskCategory,
  existingTasks: readonly Task[] = [],
): MappedPreviewRow[] {
  const clean = sanitizeMapping(mapping);
  const fieldOf = (field: ImportField): string | null => {
    const entry = Object.entries(clean).find(([, f]) => f === field);
    return entry ? entry[0] : null;
  };
  const titleCol = fieldOf("title");
  const memoCol = fieldOf("memo");
  const deadlineCol = fieldOf("deadline");
  const importanceCol = fieldOf("importance");
  const categoryCol = fieldOf("category");
  const peers = existingTasks.filter((t) => t.status === "active");
  const byMatch = new Map<string, Task>();
  for (const t of peers) {
    const k = taskMatchKey(t.title, t.category);
    if (!byMatch.has(k)) byMatch.set(k, t);
  }

  return sheet.rows.map((row) => {
    const titleRaw = titleCol ? cellToString(row[titleCol]) : "";
    const { title: splitTitle, memo: splitMemo } = splitListUp(titleRaw);
    const memoFromCol = memoCol ? cellToString(row[memoCol]) : "";
    const memo = [splitMemo, memoFromCol].filter(Boolean).join("\n");
    const title = splitTitle || titleRaw.trim();
    const deadlineRaw = deadlineCol ? cellToString(row[deadlineCol]) : "";
    const dl = parseDeadline(deadlineRaw);
    const importance = clampPriority(
      importanceCol ? cellToString(row[importanceCol]) : 2,
      2,
    );
    const category = categoryCol
      ? parseTaskCategory(cellToString(row[categoryCol]))
      : defaultCategory;

    let delta: ImportDeltaKind = "empty";
    let matchId: string | null = null;
    let exactDuplicate = false;

    if (!title) {
      delta = "empty";
    } else {
      const mk = taskMatchKey(title, category);
      const matched = byMatch.get(mk);
      const ck = taskContentKey({
        title,
        memo,
        category,
        startDate: dl.startDate,
        targetDate: dl.targetDate,
        importance,
      });
      if (matched) {
        matchId = matched.id;
        const existingCk = taskContentKey({
          title: matched.title,
          memo: matched.memo,
          category: matched.category,
          startDate: matched.startDate,
          targetDate: matched.targetDate,
          importance: matched.importance,
        });
        if (ck === existingCk) {
          delta = "unchanged";
          exactDuplicate = true;
        } else {
          delta = "changed";
        }
      } else if (findExactDuplicateTasks({ title, memo }, peers).length > 0) {
        // Same title+memo elsewhere (different 틀) — block silent re-add
        delta = "exact_block";
        exactDuplicate = true;
      } else {
        delta = "new";
      }
    }

    const similarHits =
      title && delta !== "exact_block" && delta !== "unchanged"
        ? findSimilarActiveTasks({ title, memo }, peers).filter(
            (h) =>
              h.sharedTokens.length >= 2 &&
              (matchId == null || h.task.id !== matchId),
          )
        : [];

    return {
      title,
      memo,
      deadlineLabel: dl.label,
      importance,
      done: false,
      category,
      categoryLabel: CATEGORY_LABEL[category],
      startDate: dl.startDate,
      targetDate: dl.targetDate,
      kind: dl.kind,
      skip:
        delta === "empty" ||
        delta === "unchanged" ||
        delta === "exact_block",
      exactDuplicate,
      delta,
      matchId,
      similarHits,
    };
  });
}

export type TodoDeltaCommit = {
  add: Task[];
  update: { id: string; patch: Partial<Task> }[];
};

/** Build add/update payloads from delta preview (only new + changed). */
export function previewToTodoDelta(
  preview: MappedPreviewRow[],
): TodoDeltaCommit {
  const now = new Date().toISOString();
  const add: Task[] = [];
  const update: { id: string; patch: Partial<Task> }[] = [];
  for (const r of preview) {
    if (r.delta === "new") {
      add.push({
        id: createId(),
        title: r.title,
        category: r.category,
        kind: r.kind,
        startDate: r.startDate,
        targetDate: r.targetDate,
        urgency: 1,
        importance: r.importance,
        groupKey: inferGroupKey(r.title),
        memo: r.memo,
        source: "import",
        status: "active",
        createdAt: now,
        completedAt: null,
      });
    } else if (r.delta === "changed" && r.matchId) {
      update.push({
        id: r.matchId,
        patch: {
          title: r.title,
          category: r.category,
          kind: r.kind,
          startDate: r.startDate,
          targetDate: r.targetDate,
          importance: r.importance,
          memo: r.memo,
          source: "import",
        },
      });
    }
  }
  return { add, update };
}

/** Full sheet → tasks (replace mode / empty-app first load). Ignores delta skip. */
export function previewToReplaceTasks(
  preview: MappedPreviewRow[],
): Task[] {
  const now = new Date().toISOString();
  return preview
    .filter((r) => r.delta !== "empty")
    .map((r) => ({
      id: createId(),
      title: r.title,
      category: r.category,
      kind: r.kind,
      startDate: r.startDate,
      targetDate: r.targetDate,
      urgency: 1,
      importance: r.importance,
      groupKey: inferGroupKey(r.title),
      memo: r.memo,
      source: "import" as const,
      status: "active" as const,
      createdAt: now,
      completedAt: null,
    }));
}

/** @deprecated prefer previewToTodoDelta — returns only *new* rows (not changed). */
export function sheetToTasks(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  defaultCategory: TaskCategory,
  existingTasks: readonly Task[] = [],
): Task[] {
  const preview = buildPreviewRows(
    sheet,
    mapping,
    defaultCategory,
    existingTasks,
  );
  return previewToTodoDelta(preview).add;
}

export type SideDeltaCommit = {
  add: SideListItem[];
  update: { id: string; patch: Partial<SideListItem> }[];
};

export function buildSidePreviewRows(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  existing: readonly SideListItem[] = [],
): MappedPreviewRow[] {
  const clean = sanitizeMapping(mapping);
  const fieldOf = (field: ImportField): string | null => {
    const entry = Object.entries(clean).find(([, f]) => f === field);
    return entry ? entry[0] : null;
  };
  const titleCol = fieldOf("title");
  const memoCol = fieldOf("memo");
  const byMatch = new Map<string, SideListItem>();
  for (const i of existing) {
    const k = sideMatchKey(i.title);
    if (!byMatch.has(k)) byMatch.set(k, i);
  }
  const peersAsTasks: Task[] = existing.map((i) => ({
    id: i.id,
    title: i.title,
    memo: i.memo,
    category: "work",
    kind: "someday",
    startDate: null,
    targetDate: null,
    urgency: 1,
    importance: 1,
    groupKey: "",
    source: "manual",
    status: "active",
    createdAt: i.createdAt,
    completedAt: null,
  }));

  return sheet.rows.map((row) => {
    const title = titleCol ? cellToString(row[titleCol]).trim() : "";
    const memo = memoCol ? cellToString(row[memoCol]) : "";
    let delta: ImportDeltaKind = "empty";
    let matchId: string | null = null;
    let exactDuplicate = false;
    if (!title) {
      delta = "empty";
    } else {
      const matched = byMatch.get(sideMatchKey(title));
      const ck = sideContentKey(title, memo);
      if (matched) {
        matchId = matched.id;
        if (ck === sideContentKey(matched.title, matched.memo)) {
          delta = "unchanged";
          exactDuplicate = true;
        } else {
          delta = "changed";
        }
      } else if (
        findExactDuplicateTasks({ title, memo }, peersAsTasks).length > 0
      ) {
        delta = "exact_block";
        exactDuplicate = true;
      } else {
        delta = "new";
      }
    }
    const similarHits =
      title && delta !== "exact_block" && delta !== "unchanged"
        ? findSimilarActiveTasks({ title, memo }, peersAsTasks).filter(
            (h) =>
              h.sharedTokens.length >= 2 &&
              (matchId == null || h.task.id !== matchId),
          )
        : [];
    return {
      title,
      memo,
      deadlineLabel: "",
      importance: 0,
      done: false,
      category: "work" as TaskCategory,
      categoryLabel: "",
      startDate: null,
      targetDate: null,
      kind: "someday" as TaskKind,
      skip:
        delta === "empty" ||
        delta === "unchanged" ||
        delta === "exact_block",
      exactDuplicate,
      delta,
      matchId,
      similarHits,
    };
  });
}

export function previewToSideDelta(
  preview: MappedPreviewRow[],
): SideDeltaCommit {
  const now = new Date().toISOString();
  const add: SideListItem[] = [];
  const update: { id: string; patch: Partial<SideListItem> }[] = [];
  for (const r of preview) {
    if (r.delta === "new") {
      add.push({
        id: createId(),
        title: r.title,
        memo: r.memo,
        done: false,
        createdAt: now,
        completedAt: null,
      });
    } else if (r.delta === "changed" && r.matchId) {
      update.push({
        id: r.matchId,
        patch: { title: r.title, memo: r.memo, done: false },
      });
    }
  }
  return { add, update };
}

/** Full side sheet → items (replace mode). */
export function previewToReplaceSideItems(
  preview: MappedPreviewRow[],
): SideListItem[] {
  const now = new Date().toISOString();
  return preview
    .filter((r) => r.delta !== "empty")
    .map((r) => ({
      id: createId(),
      title: r.title,
      memo: r.memo,
      done: false,
      createdAt: now,
      completedAt: null,
    }));
}

/** @deprecated prefer previewToSideDelta — returns only *new* rows. */
export function sheetToSideItems(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  existing: readonly SideListItem[] = [],
): SideListItem[] {
  return previewToSideDelta(buildSidePreviewRows(sheet, mapping, existing))
    .add;
}

export function sideKindFromSheet(
  kind: ImportSheetKind,
): SideListKind | null {
  if (kind === "guideline") return "guideline";
  if (kind === "habit") return "habit";
  return null;
}

/**
 * Prefer calendar-faithful values:
 * 1) formatted `w` when it is a range or unambiguous date text
 * 2) Excel serial number (no TZ) — cellDates:false
 * 3) Date object last
 */
function extractSheetCell(cell: XLSX.CellObject | undefined): unknown {
  if (!cell) return "";
  const w = typeof cell.w === "string" ? cell.w.trim() : "";
  if (w && /[~～〜]/.test(w)) return w;
  if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  if (w && /^\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}/.test(w)) return w;
  if (typeof cell.v === "number" && Number.isFinite(cell.v)) return cell.v;
  if (cell.v instanceof Date) return cell.v;
  if (typeof cell.v === "boolean") return cell.v ? "true" : "";
  if (typeof cell.v === "string") return cell.v;
  if (w) return w;
  return cell.v ?? "";
}

function sheetFromWorksheet(
  name: string,
  ws: XLSX.WorkSheet,
): ParsedSheet | null {
  const ref = ws["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  const headerRow: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const raw = extractSheetCell(ws[addr]);
    const s = cellToString(raw);
    headerRow.push(s || `열${c - range.s.c + 1}`);
  }
  // Deduplicate headers
  const seen = new Map<string, number>();
  const uniqueHeaders = headerRow.map((h) => {
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    return n === 0 ? h : `${h} (${n + 1})`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const obj: Record<string, unknown> = {};
    let any = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const v = extractSheetCell(ws[addr]);
      const h = uniqueHeaders[c - range.s.c];
      if (v != null && cellToString(v) !== "") any = true;
      obj[h] = v ?? "";
    }
    if (any) rows.push(obj);
  }
  return { name, headers: uniqueHeaders, rows };
}

export async function parseExcelFile(file: File): Promise<ParsedWorkbook> {
  const name = file.name || "파일";
  const lower = name.toLowerCase();
  const ok =
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv") ||
    file.type.includes("sheet") ||
    file.type.includes("csv") ||
    file.type.includes("excel");
  if (!ok && file.type && file.type !== "application/octet-stream") {
    throw new Error(
      "엑셀(.xlsx · .xls) 또는 CSV 파일만 불러올 수 있습니다.",
    );
  }

  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    // cellDates:false → keep Excel serials (no TZ Date shift). cellText for `w`.
    wb = XLSX.read(buf, {
      type: "array",
      cellDates: false,
      raw: true,
      cellText: true,
    });
  } catch {
    throw new Error(
      "파일을 읽지 못했습니다. 엑셀에서 다시 저장한 뒤 시도해 주세요.",
    );
  }

  if (!wb.SheetNames.length) {
    throw new Error("시트(장)가 없는 파일입니다.");
  }

  const sheets: ParsedSheet[] = [];
  for (const sheetName of wb.SheetNames) {
    if (!isAllowedImportSheet(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const parsed = sheetFromWorksheet(sheetName, ws);
    if (parsed && parsed.headers.length > 0) sheets.push(parsed);
  }

  if (sheets.length === 0) {
    throw new Error(
      "가져올 시트가 없습니다. 「할 일」·「지침」·「습관」만 불러올 수 있습니다.",
    );
  }

  return { fileName: name, sheets };
}

/** Prefer 「할 일」 then 지침 · 습관. */
export function pickDefaultSheetIndex(sheets: ParsedSheet[]): number {
  const order = ["할 일", "할일", "지침", "습관"];
  for (const want of order) {
    const i = sheets.findIndex(
      (s) => s.name.replace(/\s+/g, " ").trim() === want,
    );
    if (i >= 0) return i;
  }
  return 0;
}

export function mappingHasTitle(mapping: ColumnMapping): boolean {
  return Object.values(mapping).includes("title");
}

/** Find allowlisted sheet by kind (first match). Missing → null (skip quietly). */
export function findSheetByKind(
  sheets: readonly ParsedSheet[],
  kind: ImportSheetKind,
): ParsedSheet | null {
  return sheets.find((s) => classifyImportSheet(s.name) === kind) ?? null;
}

export type SheetImportSlice = {
  kind: ImportSheetKind;
  label: string;
  sheet: ParsedSheet;
  mapping: ColumnMapping;
  preview: MappedPreviewRow[];
  summary: ReturnType<typeof summarizeDeltaCounts>;
};

export type WorkbookImportPlan = {
  todo: SheetImportSlice | null;
  guideline: SheetImportSlice | null;
  habit: SheetImportSlice | null;
  /** Sheets present in file among the fixed three */
  presentLabels: string[];
  combined: ReturnType<typeof summarizeDeltaCounts>;
};

const SHEET_LABEL: Record<ImportSheetKind, string> = {
  todo: "할 일",
  guideline: "지침",
  habit: "습관",
};

/**
 * One-shot plan for 「할 일」+「지침」+「습관」.
 * Missing sheets are null (skipped quietly). Delta vs in-app data.
 */
export function buildWorkbookImportPlan(
  workbook: ParsedWorkbook,
  opts: {
    defaultCategory: TaskCategory;
    existingTasks: readonly Task[];
    existingGuidelines: readonly SideListItem[];
    existingHabits: readonly SideListItem[];
    /** Optional override for todo mapping (after father edits map step). */
    todoMapping?: ColumnMapping | null;
  },
): WorkbookImportPlan {
  const saved = loadSavedMapping();

  const makeSlice = (
    kind: ImportSheetKind,
    sheet: ParsedSheet | null,
    existingSide?: readonly SideListItem[],
  ): SheetImportSlice | null => {
    if (!sheet) return null;
    const mapping =
      kind === "todo"
        ? sanitizeMapping(
            opts.todoMapping ??
              applySavedOrAuto(sheet.headers, saved, "todo"),
          )
        : applySavedOrAuto(sheet.headers, null, kind);
    const preview =
      kind === "todo"
        ? buildPreviewRows(
            sheet,
            mapping,
            opts.defaultCategory,
            opts.existingTasks,
          )
        : buildSidePreviewRows(sheet, mapping, existingSide ?? []);
    return {
      kind,
      label: SHEET_LABEL[kind],
      sheet,
      mapping,
      preview,
      summary: summarizeDeltaCounts(preview),
    };
  };

  const todo = makeSlice("todo", findSheetByKind(workbook.sheets, "todo"));
  const guideline = makeSlice(
    "guideline",
    findSheetByKind(workbook.sheets, "guideline"),
    opts.existingGuidelines,
  );
  const habit = makeSlice(
    "habit",
    findSheetByKind(workbook.sheets, "habit"),
    opts.existingHabits,
  );

  const slices = [todo, guideline, habit].filter(
    (s): s is SheetImportSlice => s != null,
  );
  const neu = slices.reduce((n, s) => n + s.summary.neu, 0);
  const changed = slices.reduce((n, s) => n + s.summary.changed, 0);
  const unchanged = slices.reduce((n, s) => n + s.summary.unchanged, 0);
  const blocked = slices.reduce((n, s) => n + s.summary.blocked, 0);
  const parts: string[] = [];
  if (neu) parts.push(`새 ${neu}건`);
  if (changed) parts.push(`바뀐 ${changed}건`);
  if (unchanged) parts.push(`그대로 ${unchanged}건은 생략`);
  if (blocked) parts.push(`같은 내용 ${blocked}건 제외`);

  return {
    todo,
    guideline,
    habit,
    presentLabels: slices.map((s) => s.label),
    combined: {
      neu,
      changed,
      unchanged,
      blocked,
      message: parts.length ? parts.join(" · ") : "가져올 변경 없음",
    },
  };
}

export type WorkbookDeltaCommit = {
  todo: TodoDeltaCommit;
  guideline: SideDeltaCommit;
  habit: SideDeltaCommit;
};

/** Commit payloads for all present slices (empty commits for missing sheets). */
export function planToWorkbookDelta(
  plan: WorkbookImportPlan,
): WorkbookDeltaCommit {
  return {
    todo: plan.todo
      ? previewToTodoDelta(plan.todo.preview)
      : { add: [], update: [] },
    guideline: plan.guideline
      ? previewToSideDelta(plan.guideline.preview)
      : { add: [], update: [] },
    habit: plan.habit
      ? previewToSideDelta(plan.habit.preview)
      : { add: [], update: [] },
  };
}

export function workbookDeltaApplyCount(d: WorkbookDeltaCommit): number {
  return (
    d.todo.add.length +
    d.todo.update.length +
    d.guideline.add.length +
    d.guideline.update.length +
    d.habit.add.length +
    d.habit.update.length
  );
}
