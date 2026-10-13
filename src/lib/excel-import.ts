import * as XLSX from "xlsx";
import { createId } from "./id";
import { clampPriority } from "./priority";
import { inferGroupKey } from "./sort";
import {
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

/** 매핑 UI에 보이는 대상 칸 (skip 제외) */
export const IMPORT_TARGET_FIELDS: ImportField[] = [
  "title",
  "memo",
  "deadline",
  "importance",
  "urgency",
  "done",
  "category",
];

const HEADER_ALIASES: Record<Exclude<ImportField, "skip">, string[]> = {
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
  urgency: ["시급성", "시급", "urgency", "긴급"],
  done: ["완료여부", "완료", "done", "status", "상태", "끝", "끝?"],
  category: ["틀", "분류", "category", "frame", "카테고리"],
};

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
  urgency: number;
  done: boolean;
  category: TaskCategory;
  /** empty title / unusable */
  skip: boolean;
};

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
  for (const field of IMPORT_TARGET_FIELDS) {
    if (field === "skip") continue;
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
  return mapping;
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
  const hasUrgency = norms.some((n) => n === "시급성");
  // Classic father columns — not merely "any title-like + 기한"
  return hasListUp && hasDeadline && (hasImportance || hasUrgency);
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
    localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mapping));
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
  const byNorm = new Map<string, ImportField>();
  for (const [k, v] of Object.entries(saved)) {
    byNorm.set(normalizeHeader(k), v);
  }
  const used = new Set<ImportField>();
  const out: ColumnMapping = {};
  for (const h of headers) {
    const fromSaved = byNorm.get(normalizeHeader(h));
    if (
      fromSaved &&
      fromSaved !== "skip" &&
      IMPORT_TARGET_FIELDS.includes(fromSaved) &&
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
  return out;
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date (rough): 1 = 1899-12-31; SheetJS may already convert with cellDates
    if (v > 20000 && v < 80000) {
      try {
        const parsed = XLSX.SSF.parse_date_code(v);
        if (parsed && parsed.y) {
          return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
        }
      } catch {
        /* fall through */
      }
    }
    return String(v);
  }
  return String(v).trim();
}

function parseDeadline(raw: string): {
  startDate: string | null;
  targetDate: string | null;
  kind: TaskKind;
  label: string;
} {
  const s = raw.replace(/\u00a0/g, " ").trim();
  if (!s || /^언젠가$/i.test(s) || /^someday$/i.test(s)) {
    return { startDate: null, targetDate: null, kind: "someday", label: "언젠가" };
  }
  const range = s.match(
    /(\d{4})[./-](\d{1,2})[./-](\d{1,2})\s*[~～\-–—]\s*(\d{4})[./-](\d{1,2})[./-](\d{1,2})/,
  );
  if (range) {
    const start = `${range[1]}-${range[2].padStart(2, "0")}-${range[3].padStart(2, "0")}`;
    const end = `${range[4]}-${range[5].padStart(2, "0")}-${range[6].padStart(2, "0")}`;
    const kind: TaskKind = start === end ? "spot" : "ongoing";
    return {
      startDate: start,
      targetDate: end,
      kind,
      label: start === end ? start : `${start} ~ ${end}`,
    };
  }
  const single = s.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (single) {
    const iso = `${single[1]}-${single[2].padStart(2, "0")}-${single[3].padStart(2, "0")}`;
    return { startDate: iso, targetDate: iso, kind: "spot", label: iso };
  }
  // Unparsed text — treat as someday, keep label for display
  return { startDate: null, targetDate: null, kind: "someday", label: s || "언젠가" };
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
): MappedPreviewRow[] {
  const fieldOf = (field: ImportField): string | null => {
    const entry = Object.entries(mapping).find(([, f]) => f === field);
    return entry ? entry[0] : null;
  };
  const titleCol = fieldOf("title");
  const memoCol = fieldOf("memo");
  const deadlineCol = fieldOf("deadline");
  const importanceCol = fieldOf("importance");
  const urgencyCol = fieldOf("urgency");
  const doneCol = fieldOf("done");
  const categoryCol = fieldOf("category");

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
    const urgency = clampPriority(
      urgencyCol ? cellToString(row[urgencyCol]) : 1,
      1,
    );
    const done = doneCol ? parseDone(cellToString(row[doneCol])) : false;
    const category = categoryCol
      ? parseTaskCategory(cellToString(row[categoryCol]))
      : defaultCategory;

    return {
      title,
      memo,
      deadlineLabel: dl.label,
      importance,
      urgency,
      done,
      category,
      skip: !title,
    };
  });
}

/** Build tasks directly from sheet + mapping (preferred for commit). */
export function sheetToTasks(
  sheet: ParsedSheet,
  mapping: ColumnMapping,
  defaultCategory: TaskCategory,
): Task[] {
  const fieldOf = (field: ImportField): string | null => {
    const entry = Object.entries(mapping).find(([, f]) => f === field);
    return entry ? entry[0] : null;
  };
  const titleCol = fieldOf("title");
  if (!titleCol) return [];

  const memoCol = fieldOf("memo");
  const deadlineCol = fieldOf("deadline");
  const importanceCol = fieldOf("importance");
  const urgencyCol = fieldOf("urgency");
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
      const urgency = clampPriority(
        urgencyCol ? cellToString(row[urgencyCol]) : 1,
        1,
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
        urgency,
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

function sheetFromAoA(name: string, aoa: unknown[][]): ParsedSheet | null {
  if (!aoa.length) return null;
  const headerRow = aoa[0] ?? [];
  const headers = headerRow.map((c, i) => {
    const s = cellToString(c);
    return s || `열${i + 1}`;
  });
  // Deduplicate headers
  const seen = new Map<string, number>();
  const uniqueHeaders = headers.map((h) => {
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    return n === 0 ? h : `${h} (${n + 1})`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const line = aoa[r] ?? [];
    const obj: Record<string, unknown> = {};
    let any = false;
    for (let c = 0; c < uniqueHeaders.length; c++) {
      const v = line[c];
      if (v != null && cellToString(v) !== "") any = true;
      obj[uniqueHeaders[c]] = v ?? "";
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
    wb = XLSX.read(buf, {
      type: "array",
      cellDates: true,
      raw: false,
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
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    }) as unknown[][];
    const parsed = sheetFromAoA(sheetName, aoa);
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
