import { createId } from "./id";
import { inferGroupKey } from "./sort";
import type { Task, TaskKind, TaskSource } from "./types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function detectKind(line: string, hasDate: boolean, date?: string | null): TaskKind {
  const lower = line.toLowerCase();
  if (
    /오늘|당일|지금|asap|긴급|바로/.test(line) ||
    (date && date === todayIso())
  ) {
    return "spot";
  }
  if (
    hasDate ||
    /까지|마감|기한|이번\s*주|다음\s*주|지속/.test(line)
  ) {
    return "ongoing";
  }
  if (/언젠가|여유|나중|someday/.test(lower)) return "someday";
  return hasDate ? "ongoing" : "someday";
}

function parseDateFromLine(line: string): string | null {
  const m1 = line.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m1) {
    return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
  }
  const m2 = line.match(/(\d{1,2})[./월](\d{1,2})/);
  if (m2) {
    const y = new Date().getFullYear();
    return `${y}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  }
  if (/오늘/.test(line)) return todayIso();
  if (/내일/.test(line)) return inDays(1);
  if (/이번\s*주/.test(line)) return inDays(3);
  return null;
}

function urgencyFromLine(line: string): number {
  if (/긴급|asap|당장|최우선/.test(line)) return 5;
  if (/급|우선|빨리/.test(line)) return 4;
  if (/보통|일반/.test(line)) return 3;
  if (/여유|나중/.test(line)) return 2;
  return 3;
}

function importanceFromLine(line: string): number {
  if (/중요|핵심|필수|반드시/.test(line)) return 5;
  if (/주요/.test(line)) return 4;
  return 3;
}

function cleanTitle(line: string): string {
  return line
    .replace(/^[-*•\d.)\]]+\s*/, "")
    .replace(/오늘|내일|이번\s*주|asap|긴급|우선/gi, "")
    .replace(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMemoText(text: string, source: TaskSource = "memo"): Task[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^#{1,6}\s/.test(l));

  return lines
    .map((line) => {
      const targetDate = parseDateFromLine(line);
      const title = cleanTitle(line) || line;
      const kind = detectKind(line, Boolean(targetDate), targetDate);
      return {
        id: createId(),
        title,
        kind,
        targetDate: kind === "someday" ? null : targetDate ?? (kind === "spot" ? todayIso() : inDays(7)),
        urgency: urgencyFromLine(line),
        importance: importanceFromLine(line),
        groupKey: inferGroupKey(title),
        notes: line !== title ? `원문: ${line}` : "",
        source,
        status: "active" as const,
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
    })
    .filter((t) => t.title.length > 0);
}

export function parseJsonTasks(raw: string): Task[] {
  const data = JSON.parse(raw) as unknown;
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && "tasks" in data
      ? (data as { tasks: unknown }).tasks
      : data && typeof data === "object" && "events" in data
        ? (data as { events: unknown }).events
        : null;

  if (!Array.isArray(list)) {
    throw new Error("JSON 형식이 올바르지 않습니다. 배열 또는 { tasks/events } 가 필요합니다.");
  }

  return list.map((item, i) => {
    const obj = item as Record<string, unknown>;
    const title =
      String(obj.title ?? obj.summary ?? obj.name ?? `일정 ${i + 1}`).trim();
    const dateRaw = String(
      obj.targetDate ?? obj.date ?? obj.start ?? obj.dtstart ?? "",
    ).slice(0, 10);
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
    const kind: TaskKind =
      (obj.kind as TaskKind) ||
      (targetDate === todayIso() ? "spot" : targetDate ? "ongoing" : "someday");

    return {
      id: createId(),
      title,
      kind,
      targetDate,
      urgency: Number(obj.urgency ?? 3) || 3,
      importance: Number(obj.importance ?? 3) || 3,
      groupKey: String(obj.groupKey ?? inferGroupKey(title)),
      notes: String(obj.notes ?? obj.description ?? ""),
      source: "calendar" as const,
      status: "active" as const,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
  });
}

/** 최소 ICS 파서 — VEVENT SUMMARY / DTSTART */
export function parseIcs(text: string): Task[] {
  const events = text.split("BEGIN:VEVENT").slice(1);
  if (events.length === 0) {
    throw new Error("ICS에서 일정을 찾지 못했습니다.");
  }

  return events.map((block) => {
    const summary =
      block.match(/SUMMARY[^:]*:(.+)/)?.[1]?.trim().replace(/\\,/g, ",") ??
      "제목 없는 일정";
    const dt =
      block.match(/DTSTART[^:]*:(\d{8})/)?.[1] ??
      block.match(/DTSTART[^:]*:(\d{4}-\d{2}-\d{2})/)?.[1];
    let targetDate: string | null = null;
    if (dt) {
      if (/^\d{8}$/.test(dt)) {
        targetDate = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
      } else {
        targetDate = dt.slice(0, 10);
      }
    }
    const kind: TaskKind =
      targetDate === todayIso() ? "spot" : targetDate ? "ongoing" : "someday";

    return {
      id: createId(),
      title: summary,
      kind,
      targetDate,
      urgency: 3,
      importance: 3,
      groupKey: inferGroupKey(summary),
      notes: "ICS import",
      source: "calendar" as const,
      status: "active" as const,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
  });
}

export const MOCK_CALENDAR_JSON = `{
  "events": [
    {
      "title": "후보 인터뷰 — 김○○",
      "date": "${todayIso()}",
      "urgency": 5,
      "importance": 5,
      "notes": "mock 구글 캘린더"
    },
    {
      "title": "클라이언트 주간 싱크",
      "date": "${inDays(2)}",
      "urgency": 3,
      "importance": 4
    },
    {
      "title": "업계 세미나 참석 검토",
      "date": "${inDays(14)}",
      "urgency": 2,
      "importance": 3
    }
  ]
}`;

export const MOCK_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//일비서//Mock//KO
BEGIN:VEVENT
DTSTART:${todayIso().replace(/-/g, "")}
SUMMARY:오후 후보자 콜
END:VEVENT
BEGIN:VEVENT
DTSTART:${inDays(4).replace(/-/g, "")}
SUMMARY:오퍼레터 초안 공유
END:VEVENT
END:VCALENDAR`;

/** OCR API 키가 없을 때 쓰는 목 추출 */
export async function mockOcrFromImage(file: File): Promise<string> {
  await new Promise((r) => setTimeout(r, 600));
  const name = file.name.replace(/\.[^.]+$/, "");
  return [
    `오늘 ${name || "손글씨 메모"} 확인`,
    "후보자 연락처 정리 — 이번 주",
    "언젠가 명함함 정리",
  ].join("\n");
}
