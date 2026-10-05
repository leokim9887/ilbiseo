import { createId } from "./id";
import { inferGroupKey } from "./sort";
import type { Task, TaskCategory, TaskKind, TaskSource } from "./types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function detectKind(line: string, hasDate: boolean, date?: string | null): TaskKind {
  if (/오늘|당일|지금|asap|긴급|바로/.test(line) || (date && date === todayIso())) {
    return "spot";
  }
  if (hasDate || /까지|마감|기한|이번\s*주|다음\s*주|지속/.test(line)) {
    return "ongoing";
  }
  if (/언젠가|여유|나중|someday/i.test(line)) return "someday";
  return hasDate ? "ongoing" : "someday";
}

function parseDateFromLine(line: string): string | null {
  const m1 = line.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m1) {
    return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
  }
  if (/오늘/.test(line)) return todayIso();
  if (/내일/.test(line)) return inDays(1);
  if (/이번\s*주/.test(line)) return inDays(3);
  return null;
}

function cleanTitle(line: string): string {
  return line
    .replace(/^[-*•\d.)\]]+\s*/, "")
    .replace(/오늘|내일|이번\s*주|asap|긴급|우선/gi, "")
    .replace(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMemoText(
  text: string,
  source: TaskSource = "memo",
  category: TaskCategory = "work",
): Task[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^#{1,6}\s/.test(l));

  return lines
    .map((line) => {
      const targetDate = parseDateFromLine(line);
      const title = cleanTitle(line) || line;
      const kind = detectKind(line, Boolean(targetDate), targetDate);
      const end =
        kind === "someday"
          ? null
          : targetDate ?? (kind === "spot" ? todayIso() : inDays(7));
      return {
        id: createId(),
        title,
        category,
        kind,
        startDate: end,
        targetDate: end,
        urgency: /긴급|asap|당장|최우선/.test(line)
          ? 5
          : /급|우선|빨리/.test(line)
            ? 4
            : 3,
        importance: /중요|핵심|필수|반드시/.test(line) ? 5 : 3,
        groupKey: inferGroupKey(title),
        memo: line !== title ? `원문: ${line}` : "",
        source,
        status: "active" as const,
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
    })
    .filter((t) => t.title.length > 0);
}
