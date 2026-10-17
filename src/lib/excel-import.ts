import * as XLSX from "xlsx";
import { createId } from "./id";
import { clampPriority } from "./priority";
import { inferGroupKey } from "./sort";
import {
  findSimilarActiveTasks,
  buildSimilarityAlertMessage,
  type SimilarityHit,
} from "./text-similarity";
import {
  CATEGORY_LABEL,
  parseTaskCategory,
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
  skip: "(사용 안 함)",
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
  done: ["완료여부", "완료", "done", "status", "상태", "끝", "끝?"],
  category: ["틀", "분류", "category", "frame", "카테고리"],
};

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

export type MappedPreviewRow = {
  title: string;
  memo: string;
  deadlineLabel: string;
  importance: number;
  done: boolean;
  category: TaskCategory;
  categoryLabel: string;
  /** empty title / unusable */
  skip: boolean;
  /** Peers already in the app that look similar (2+ shared words / near-dupe) */
  similarHits: SimilarityHit[];
};

/** True when mapping includes an Excel 「틀」 column. */
export function mappingHasCategory(mapping: ColumnMapping): boolean {
  return Object.values(sanitizeMapping(mapping)).includes("category");
}

/**
 * Father-visible summary when imported rows overlap existing tasks.
 * Uses the same similarity engine as in-app edit alerts (no false loose singles).
 */
export function summarizeImportSimilarities(
  preview: MappedPreviewRow[],
): { count: number; message: string } | null {
  const withHits = preview.filter((r) => !r.skip && r.similarHits.length > 0);
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

export function suggestFieldForHeader(header: string): ImportField {
  const n = normalizeHeader(header);
  if (!n) return "skip";
  // Prefer exact template match for title
  if (TEMPLATE_TITLE_HEADERS.has(n) || n === "할 일" || n === "할일") {
    return "title";
  }
  // 시급성 열은 조용히 무시 (예전 파일 호환)
  if (
    URGENCY_HEADER_ALIASES.some(
      (a) => n === a || n.includes(a) || a.includes(n),
    )
  ) {
    return "skip";
  }
  for (const field of IMPORT_TARGET_FIELDS) {
    const aliases = HEADER_ALIASES[field];
    if (
      aliases.some(
        (a: string) => n === a || n.includes(a) || a.includes(n),
      )
    ) {
      return field;
    }
  }
  // 순서 열은 무시
  if (n === "순서" || n === "순" || n === "no" || n === "#") return "skip";
  return "skip";
}

export function autoMapHeaders(headers: string[]): ColumnMapping {
  const used = new Set<ImportField>();
  const mapping: ColumnMapping = {};
  for (const h of headers) {
    const suggested = suggestFieldForHeader(h);
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
): ColumnMapping {
  const auto = autoMapHeaders(headers);
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

/** Date → YYYY-MM-DD using UTC (export writes UTC midnight). */
function dateToIsoUtc(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    return dateToIsoUtc(v) ?? "";
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

/** Parse one calendar day from common Excel / father text forms. */
function parseOneDate(raw: string): string | null {
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

  // Bare Excel serial
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));

  return null;
}

/**
 * Parse 「마감목표」 from Excel export / father-edited cells.
 * Handles: Date serials, YYYY-MM-DD, ranges `A ~ B`, locale m/d/yy,
 * Korean 년월일, ISO datetime. Empty / 「언젠가」 → someday (no fake dates).
 */
export function parseDeadline(raw: string): {
  startDate: string | null;
  targetDate: string | null;
  kind: TaskKind;
  label: string;
} {
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
    const start = parseOneDate(rangeParts[0]);
    const end = parseOneDate(rangeParts[1]);
    if (start && end) {
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
    const start = parseOneDate(hyphenRange[1]);
    const end = parseOneDate(hyphenRange[2]);
    if (start && end) {
      const kind: TaskKind = start === end ? "spot" : "ongoing";
      return {
        startDate: start,
        targetDate: end,
        kind,
        label: start === end ? start : `${start} ~ ${end}`,
      };
    }
  }

  const single = parseOneDate(s);
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
  const doneCol = fieldOf("done");
  const categoryCol = fieldOf("category");
  const peers = existingTasks.filter((t) => t.status === "active");

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
    const done = doneCol ? parseDone(cellToString(row[doneCol])) : false;
    const category = categoryCol
      ? parseTaskCategory(cellToString(row[categoryCol]))
      : defaultCategory;
    const similarHits =
      title && !done
        ? findSimilarActiveTasks({ title, memo }, peers)
        : [];

    return {
      title,
      memo,
      deadlineLabel: dl.label,
      importance,
      done,
      category,
      categoryLabel: CATEGORY_LABEL[category],
      skip: !title,
      similarHits,
    };
  });
}

/** Build tasks directly from sheet + mapping (preferred for commit). */
export function sheetToTasks(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  defaultCategory: TaskCategory,
): Task[] {
  const clean = sanitizeMapping(mapping);
  const fieldOf = (field: ImportField): string | null => {
    const entry = Object.entries(clean).find(([, f]) => f === field);
    return entry ? entry[0] : null;
  };
  const titleCol = fieldOf("title");
  if (!titleCol) return [];

  const memoCol = fieldOf("memo");
  const deadlineCol = fieldOf("deadline");
  const importanceCol = fieldOf("importance");
  const doneCol = fieldOf("done");
  const categoryCol = fieldOf("category");
  const now = new Date().toISOString();

  return sheet.rows
    .map((row) => {
      const titleRaw = cellToString(row[titleCol]);
      const { title: splitTitle, memo: splitMemo } = splitListUp(titleRaw);
      const memoFromCol = memoCol ? cellToString(row[memoCol]) : "";
      const memo = [splitMemo, memoFromCol].filter(Boolean).join("\n");
      const title = splitTitle || titleRaw.trim();
      if (!title) return null;

      const deadlineRaw = deadlineCol ? cellToString(row[deadlineCol]) : "";
      const dl = parseDeadline(deadlineRaw);
      const importance = clampPriority(
        importanceCol ? cellToString(row[importanceCol]) : 2,
        2,
      );
      const done = doneCol ? parseDone(cellToString(row[doneCol])) : false;
      const category = categoryCol
        ? parseTaskCategory(cellToString(row[categoryCol]))
        : defaultCategory;

      const task: Task = {
        id: createId(),
        title,
        category,
        kind: dl.kind,
        startDate: dl.startDate,
        targetDate: dl.targetDate,
        // 시급성 열은 무시 — 기본값만 저장 (JSON 호환)
        urgency: 1,
        importance,
        groupKey: inferGroupKey(title),
        memo,
        source: "import",
        status: done ? "completed" : "active",
        createdAt: now,
        completedAt: done ? now : null,
      };
      return task;
    })
    .filter((t): t is Task => t != null);
}

/**
 * Prefer raw Date/serial over locale-formatted text (avoids m/d/yy → 「언젠가」).
 * Keep formatted `w` when it encodes a range (`~`) from our export numFmt.
 */
function extractSheetCell(cell: XLSX.CellObject | undefined): unknown {
  if (!cell) return "";
  const w = typeof cell.w === "string" ? cell.w.trim() : "";
  if (w && /[~～〜]/.test(w)) return w;
  if (cell.v instanceof Date) return cell.v;
  if (typeof cell.v === "number" && Number.isFinite(cell.v)) return cell.v;
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
    // raw:true keeps Date/serial — we format ourselves (locale w is lossy)
    wb = XLSX.read(buf, {
      type: "array",
      cellDates: true,
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
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const parsed = sheetFromWorksheet(sheetName, ws);
    if (parsed && parsed.headers.length > 0) sheets.push(parsed);
  }

  if (sheets.length === 0) {
    throw new Error("읽을 수 있는 표가 없습니다. 첫 줄에 열 이름이 있는지 확인해 주세요.");
  }

  return { fileName: name, sheets };
}

/** Prefer 「할 일」 sheet when present. */
export function pickDefaultSheetIndex(sheets: ParsedSheet[]): number {
  const prefer = ["할 일", "할일", "todo", "to do", "to-do"];
  for (let i = 0; i < sheets.length; i++) {
    const n = sheets[i].name.trim().toLowerCase();
    if (prefer.some((p) => n === p || n.includes(p))) return i;
  }
  return 0;
}

export function mappingHasTitle(mapping: ColumnMapping): boolean {
  return Object.values(mapping).includes("title");
}
