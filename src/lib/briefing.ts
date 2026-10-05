import {
  CATEGORY_LABEL,
  KIND_LABEL,
  type CalendarEvent,
  type Task,
  type TaskCategory,
  type TaskKind,
} from "./types";
import { sortCompleted, sortTasks } from "./sort";
import { formatCalendarWhen } from "./calendar-data";
import {
  importanceLabel,
  priorityTag as makePriorityTag,
  urgencyLabel,
} from "./priority";

export type BriefingLine = {
  title: string;
  kind: TaskKind;
  kindLabel: string;
  category: TaskCategory;
  categoryLabel: string;
  targetDate: string | null;
  importance: number;
  urgency: number;
  importanceLabel: string;
  urgencyLabel: string;
  groupKey: string;
  memo: string;
  priorityTag: string;
};

export type BriefingSection = {
  kind: TaskKind;
  title: string;
  summary: string;
  lines: BriefingLine[];
};

export type DailyBriefing = {
  date: string;
  generatedAt: string;
  headline: string;
  summaryLine: string;
  sections: BriefingSection[];
  calendarLines: {
    when: string;
    title: string;
    notes: string;
    calendarName?: string;
  }[];
  plaintext: string;
  activeCount: number;
  completedCount: number;
};

const SECTION_TITLE: Record<TaskKind, string> = {
  spot: "① 스팟 — 오늘 마무리",
  ongoing: "② 지속 — 목표기일까지",
  someday: "③ 언젠가 — 시급·중요 순",
};

function todayIso(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function formatKoDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function nearWindow(dateStr: string, today: string, days = 7): boolean {
  const t = dateStr.slice(0, 10);
  if (t < today) return false;
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  return t <= end.toISOString().slice(0, 10);
}

export function buildDailyBriefing(
  tasks: Task[],
  calendarEvents: CalendarEvent[] = [],
  now = new Date(),
): DailyBriefing {
  const sorted = sortTasks(tasks);
  const completed = sortCompleted(tasks);
  const date = todayIso(now);

  const focus = sorted.filter((t) => {
    if (t.kind === "spot") return true;
    if (t.kind === "someday") return t.importance >= 3 || t.urgency >= 3;
    if (t.targetDate) return nearWindow(t.targetDate, date, 7);
    return true;
  });
  const list = focus.length > 0 ? focus : sorted;

  const byKind: Record<TaskKind, Task[]> = {
    spot: [],
    ongoing: [],
    someday: [],
  };
  for (const t of list) byKind[t.kind].push(t);

  const sections: BriefingSection[] = (
    ["spot", "ongoing", "someday"] as TaskKind[]
  )
    .filter((k) => byKind[k].length > 0)
    .map((kind) => {
      const lines: BriefingLine[] = byKind[kind].map((t) => ({
        title: t.title,
        kind,
        kindLabel: KIND_LABEL[kind],
        category: t.category,
        categoryLabel: CATEGORY_LABEL[t.category],
        targetDate: t.targetDate,
        importance: t.importance,
        urgency: t.urgency,
        importanceLabel: importanceLabel(t.importance),
        urgencyLabel: urgencyLabel(t.urgency),
        groupKey: t.groupKey,
        memo: t.memo,
        priorityTag: makePriorityTag(t.importance, t.urgency),
      }));
      return {
        kind,
        title: SECTION_TITLE[kind],
        summary: `${lines.length}건`,
        lines,
      };
    });

  const calendarLines = calendarEvents
    .filter((e) => nearWindow(e.start, date, 7))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({
      when: formatCalendarWhen(e),
      title: e.title,
      notes: e.notes,
      calendarName: e.calendarName,
    }));

  const headline = `일비서 브리핑 · ${formatKoDate(date)}`;
  const summaryLine = `할 일 ${list.length}건 · 캘린더(근접) ${calendarLines.length}건 · 한 일 ${completed.length}건`;

  const parts: string[] = [
    headline,
    summaryLine,
    "※ 같은 기간으로 합쳐 보되, 【할 일】과 【구글 캘린더】는 출처를 구분합니다.",
    "",
    "【할 일】",
  ];

  for (const section of sections) {
    parts.push(section.title);
    let lastGroup = "";
    for (const line of section.lines) {
      if (line.groupKey && line.groupKey !== lastGroup) {
        parts.push(`  〔${line.categoryLabel} · ${line.groupKey}〕`);
        lastGroup = line.groupKey;
      }
      const meta = [
        line.priorityTag,
        line.categoryLabel,
        `중요 ${line.importance}(${line.importanceLabel})`,
        `시급 ${line.urgency}(${line.urgencyLabel})`,
        line.targetDate ? `기한 ${line.targetDate}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      parts.push(`  ☐ ${line.title}`);
      parts.push(`    ${meta}`);
      if (line.memo) parts.push(`    메모: ${line.memo}`);
    }
    parts.push("");
  }

  if (sections.length === 0) {
    parts.push("  (활성 할 일 없음)");
    parts.push("");
  }

  parts.push("【구글 캘린더】");
  if (calendarLines.length === 0) {
    parts.push("  (근접 일정 없음)");
  } else {
    for (const c of calendarLines) {
      const cal = c.calendarName ? ` · ${c.calendarName}` : "";
      parts.push(`  • ${c.when}  ${c.title}${cal}`);
      if (c.notes) parts.push(`    ${c.notes}`);
    }
  }

  return {
    date,
    generatedAt: now.toISOString(),
    headline,
    summaryLine,
    sections,
    calendarLines,
    plaintext: parts.join("\n").trim() + "\n",
    activeCount: sorted.length,
    completedCount: completed.length,
  };
}

export const SETTINGS_KEY = "ilbiseo-settings-v1";

export type AppSettings = {
  briefingHour: string;
  workEmail: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  briefingHour: "08:00",
  workEmail: "",
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      briefingHour: parsed.briefingHour || DEFAULT_SETTINGS.briefingHour,
      workEmail: parsed.workEmail ?? "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
