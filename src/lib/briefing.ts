import {
  CATEGORY_LABEL,
  KIND_LABEL,
  type CalendarEvent,
  type ChecklistItem,
  type Task,
  type TaskCategory,
  type TaskKind,
} from "./types";
import { sortCompleted, sortTasks } from "./sort";
import { formatCalendarWhen } from "./calendar-data";

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
  checklistSections: {
    category: TaskCategory;
    categoryLabel: string;
    items: { title: string; checked: boolean }[];
  }[];
  calendarLines: { when: string; title: string; notes: string }[];
  plaintext: string;
  activeCount: number;
  completedCount: number;
  checklistOpenCount: number;
};

const SECTION_TITLE: Record<TaskKind, string> = {
  spot: "① 스팟 — 오늘 마무리",
  ongoing: "② 지속 — 목표기일까지",
  someday: "③ 언젠가 — 시급·중요 순",
};

function importanceLabel(n: number): string {
  if (n >= 5) return "매우 중요";
  if (n >= 4) return "중요";
  if (n >= 3) return "보통";
  if (n >= 2) return "낮음";
  return "여유";
}

function urgencyLabel(n: number): string {
  if (n >= 5) return "매우 시급";
  if (n >= 4) return "시급";
  if (n >= 3) return "보통";
  if (n >= 2) return "여유";
  return "느긋";
}

function priorityTag(task: Task): string {
  if (task.importance >= 5 || task.urgency >= 5) return "★최우선";
  if (task.importance >= 4 || task.urgency >= 4) return "◆우선";
  return "";
}

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
  checklists: ChecklistItem[] = [],
  calendarEvents: CalendarEvent[] = [],
  now = new Date(),
): DailyBriefing {
  const sorted = sortTasks(tasks);
  const completed = sortCompleted(tasks);
  const date = todayIso(now);

  // Prefer today + nearby for ongoing/spot; keep someday high priority
  const focus = sorted.filter((t) => {
    if (t.kind === "spot") return true;
    if (t.kind === "someday") return t.importance >= 4 || t.urgency >= 4;
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
        priorityTag: priorityTag(t),
      }));
      return {
        kind,
        title: SECTION_TITLE[kind],
        summary: `${lines.length}건`,
        lines,
      };
    });

  const openChecks = checklists.filter((c) => !c.checked);
  const checklistSections = (
    ["work", "personal", "project", "team"] as TaskCategory[]
  )
    .map((category) => {
      const items = checklists
        .filter((c) => c.category === category)
        .map((c) => ({ title: c.title, checked: c.checked }));
      return {
        category,
        categoryLabel: CATEGORY_LABEL[category],
        items,
      };
    })
    .filter((s) => s.items.length > 0);

  const calendarLines = calendarEvents
    .filter((e) => nearWindow(e.start, date, 7))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({
      when: formatCalendarWhen(e),
      title: e.title,
      notes: e.notes,
    }));

  const headline = `일비서 브리핑 · ${formatKoDate(date)}`;
  const summaryLine = `할 일 ${list.length}건 · 체크리스트 미완료 ${openChecks.length}건 · 캘린더(근접) ${calendarLines.length}건 · 한 일 ${completed.length}건`;

  const parts: string[] = [
    headline,
    summaryLine,
    "※ 일비서 할 일/체크리스트와 구글 캘린더는 구분되어 있습니다.",
    "",
    "【일비서 할 일】",
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

  parts.push("【체크리스트】");
  if (checklistSections.length === 0) {
    parts.push("  (항목 없음)");
  } else {
    for (const sec of checklistSections) {
      parts.push(`  〔${sec.categoryLabel}〕`);
      for (const item of sec.items) {
        parts.push(`  ${item.checked ? "☑" : "☐"} ${item.title}`);
      }
    }
  }
  parts.push("");

  parts.push("【구글 캘린더 — 별도】");
  if (calendarLines.length === 0) {
    parts.push("  (근접 일정 없음)");
  } else {
    for (const c of calendarLines) {
      parts.push(`  • ${c.when}  ${c.title}`);
      if (c.notes) parts.push(`    ${c.notes}`);
    }
  }

  return {
    date,
    generatedAt: now.toISOString(),
    headline,
    summaryLine,
    sections,
    checklistSections,
    calendarLines,
    plaintext: parts.join("\n").trim() + "\n",
    activeCount: sorted.length,
    completedCount: completed.length,
    checklistOpenCount: openChecks.length,
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
