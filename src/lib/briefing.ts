import { KIND_LABEL, type Task, type TaskKind } from "./types";
import { sortCompleted, sortTasks } from "./sort";

export type BriefingLine = {
  title: string;
  kind: TaskKind;
  kindLabel: string;
  targetDate: string | null;
  importance: number;
  urgency: number;
  importanceLabel: string;
  urgencyLabel: string;
  groupKey: string;
  notes: string;
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
  plaintext: string;
  activeCount: number;
  completedCount: number;
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
  const date = new Date(y, m - 1, day);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function buildDailyBriefing(
  tasks: Task[],
  now = new Date(),
): DailyBriefing {
  const sorted = sortTasks(tasks);
  const completed = sortCompleted(tasks);
  const date = todayIso(now);

  const byKind: Record<TaskKind, Task[]> = {
    spot: [],
    ongoing: [],
    someday: [],
  };
  for (const t of sorted) byKind[t.kind].push(t);

  const sections: BriefingSection[] = (["spot", "ongoing", "someday"] as TaskKind[])
    .filter((k) => byKind[k].length > 0)
    .map((kind) => {
      const lines: BriefingLine[] = byKind[kind].map((t) => ({
        title: t.title,
        kind,
        kindLabel: KIND_LABEL[kind],
        targetDate: t.targetDate,
        importance: t.importance,
        urgency: t.urgency,
        importanceLabel: importanceLabel(t.importance),
        urgencyLabel: urgencyLabel(t.urgency),
        groupKey: t.groupKey,
        notes: t.notes,
        priorityTag: priorityTag(t),
      }));
      return {
        kind,
        title: SECTION_TITLE[kind],
        summary: `${lines.length}건`,
        lines,
      };
    });

  const headline = `일비서 브리핑 · ${formatKoDate(date)}`;
  const summaryLine = `활성 ${sorted.length}건 (스팟 ${byKind.spot.length} · 지속 ${byKind.ongoing.length} · 언젠가 ${byKind.someday.length}) · 완료 기록 ${completed.length}건`;

  const plaintextParts: string[] = [
    headline,
    summaryLine,
    "정렬: 스팟 → 지속 → 언젠가 · 유사 할일 묶음",
    "",
  ];

  for (const section of sections) {
    plaintextParts.push(section.title);
    let lastGroup = "";
    for (const line of section.lines) {
      if (line.groupKey && line.groupKey !== lastGroup) {
        plaintextParts.push(`  〔${line.groupKey}〕`);
        lastGroup = line.groupKey;
      }
      const meta = [
        line.priorityTag,
        `중요 ${line.importance}(${line.importanceLabel})`,
        `시급 ${line.urgency}(${line.urgencyLabel})`,
        line.targetDate ? `기한 ${line.targetDate}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      plaintextParts.push(`  • ${line.title}`);
      plaintextParts.push(`    ${meta}`);
    }
    plaintextParts.push("");
  }

  if (sections.length === 0) {
    plaintextParts.push("오늘 등록된 활성 할 일이 없습니다.");
  }

  return {
    date,
    generatedAt: now.toISOString(),
    headline,
    summaryLine,
    sections,
    plaintext: plaintextParts.join("\n").trim() + "\n",
    activeCount: sorted.length,
    completedCount: completed.length,
  };
}

export const SETTINGS_KEY = "ilbiseo-settings-v1";

export type AppSettings = {
  briefingHour: string; // "HH:MM"
};

export const DEFAULT_SETTINGS: AppSettings = {
  briefingHour: "07:30",
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      briefingHour: parsed.briefingHour || DEFAULT_SETTINGS.briefingHour,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
