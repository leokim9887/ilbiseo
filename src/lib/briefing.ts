import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  KIND_LABEL,
  SIDE_LIST_LABEL,
  type CalendarEvent,
  type SideListItem,
  type Task,
  type TaskCategory,
  type TaskKind,
} from "./types";
import { sortCompleted, sortTasks } from "./sort";
import { formatCalendarWhen } from "./calendar-data";
import { eventInclusiveDayRange } from "./calendar-span";
import {
  formatDeadlineRange,
  overlapsPeriod,
  todayIsoKst,
  weekRangeContaining,
} from "./date-range";
import {
  importanceLabel,
  priorityTag as makePriorityTag,
} from "./priority";
import { hasMeaningfulTaskContent } from "./text-similarity";

export type BriefingLine = {
  title: string;
  kind: TaskKind;
  kindLabel: string;
  category: TaskCategory;
  categoryLabel: string;
  targetDate: string | null;
  /** Display 마감목표 — single day or `YY-MM-DD ~ YY-MM-DD` */
  deadlineLabel: string;
  importance: number;
  importanceLabel: string;
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
  }[];
  guidelineLines: { title: string; memo: string; done: boolean }[];
  habitLines: { title: string; memo: string; done: boolean }[];
  plaintext: string;
  html: string;
  activeCount: number;
  completedCount: number;
};

/**
 * Briefing schedule line: date/time + title only.
 * Never append Google account / calendarName (connection UI keeps that).
 * Shared by in-app preview, SMTP mail, Excel「브리핑요약」.
 */
export function formatBriefingCalendarLine(line: {
  when: string;
  title: string;
}): string {
  const when = line.when.trim();
  const title = line.title.trim();
  if (!when) return title;
  if (!title) return when;
  return `${when} ${title}`;
}

const SECTION_TITLE: Record<TaskKind, string> = {
  spot: "① 스팟 — 오늘 마무리",
  ongoing: "② 지속 — 목표기일까지",
  someday: "③ 언젠가 — 중요도 순",
};

function formatKoDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/**
 * Google Calendar in briefing: 「이번 주」= Mon–Sun week containing
 * the briefing day (KST calendar date). App 할 일 stay today-only.
 */
function eventOverlapsBriefingWeek(ev: CalendarEvent, today: string): boolean {
  const { start, end } = weekRangeContaining(today);
  const { startDay, endDay } = eventInclusiveDayRange(ev);
  return startDay <= end && endDay >= start;
}

/**
 * Include task in the morning briefing when its 마감목표 range
 * (startDate ~ targetDate, including multi-day) overlaps **today only** (KST).
 * Future ranges like `2026-10-16 ~ 2026-10-17` must not appear on 10-14.
 * Undated spot / high-priority someday / undated ongoing stay as focus items.
 * Blank 「행 추가」 shells (no title + no memo / placeholder-only) are excluded.
 */
function taskInBriefingWindow(t: Task, today: string): boolean {
  if (!hasMeaningfulTaskContent(t)) return false;
  if (t.startDate || t.targetDate) {
    return overlapsPeriod(t, today, today);
  }
  if (t.kind === "spot") return true;
  if (t.kind === "someday") return t.importance >= 3;
  return true;
}

function sideLines(items: SideListItem[]) {
  return items.map((i) => ({
    title: i.title,
    memo: i.memo,
    done: i.done,
  }));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBriefingHtml(opts: {
  headline: string;
  summaryLine: string;
  allLines: BriefingLine[];
  guidelineLines: { title: string; memo: string; done: boolean }[];
  habitLines: { title: string; memo: string; done: boolean }[];
  calendarLines: {
    when: string;
    title: string;
    notes: string;
  }[];
}): string {
  const blocks: string[] = [];
  blocks.push(
    `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;line-height:1.55;color:#1a1f1c;max-width:560px;">`,
  );
  blocks.push(
    `<p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#163F39;">${escapeHtml(opts.headline)}</p>`,
  );
  blocks.push(
    `<p style="margin:0 0 18px;font-size:13px;color:#5a635e;">${escapeHtml(opts.summaryLine)}</p>`,
  );

  blocks.push(`<p style="margin:0 0 8px;font-size:15px;font-weight:700;">【할 일】</p>`);
  if (opts.allLines.length === 0) {
    blocks.push(`<p style="margin:0 0 16px;color:#6a7670;">(활성 할 일 없음)</p>`);
  } else {
    for (const cat of CATEGORY_ORDER) {
      const catLines = opts.allLines.filter((l) => l.category === cat);
      if (catLines.length === 0) continue;
      blocks.push(
        `<p style="margin:12px 0 6px;font-size:14px;font-weight:700;color:#217346;">〔${escapeHtml(CATEGORY_LABEL[cat])}〕</p>`,
      );
      blocks.push(`<ul style="margin:0 0 8px;padding-left:18px;">`);
      for (const line of catLines) {
        const bits = [
          line.priorityTag,
          line.kindLabel,
          line.deadlineLabel ? `기한 ${line.deadlineLabel}` : null,
        ].filter(Boolean);
        blocks.push(`<li style="margin:0 0 10px;">`);
        blocks.push(
          `<div style="font-weight:600;">☐ ${escapeHtml(line.title)}</div>`,
        );
        if (bits.length) {
          blocks.push(
            `<div style="font-size:13px;color:#5a635e;">${escapeHtml(bits.join(" · "))}</div>`,
          );
        }
        if (line.memo) {
          blocks.push(
            `<div style="font-size:13px;color:#454d48;">메모: ${escapeHtml(line.memo)}</div>`,
          );
        }
        blocks.push(`</li>`);
      }
      blocks.push(`</ul>`);
    }
  }

  if (opts.guidelineLines.length > 0) {
    blocks.push(
      `<p style="margin:16px 0 6px;font-size:15px;font-weight:700;">【${escapeHtml(SIDE_LIST_LABEL.guideline)}】</p>`,
    );
    blocks.push(`<ul style="margin:0 0 8px;padding-left:18px;">`);
    for (const line of opts.guidelineLines) {
      blocks.push(
        `<li style="margin:0 0 6px;">${line.done ? "☑" : "☐"} ${escapeHtml(line.title)}${line.memo ? ` <span style="color:#5a635e;">— ${escapeHtml(line.memo)}</span>` : ""}</li>`,
      );
    }
    blocks.push(`</ul>`);
  }

  if (opts.habitLines.length > 0) {
    blocks.push(
      `<p style="margin:16px 0 6px;font-size:15px;font-weight:700;">【${escapeHtml(SIDE_LIST_LABEL.habit)}】</p>`,
    );
    blocks.push(`<ul style="margin:0 0 8px;padding-left:18px;">`);
    for (const line of opts.habitLines) {
      blocks.push(
        `<li style="margin:0 0 6px;">${line.done ? "☑" : "☐"} ${escapeHtml(line.title)}${line.memo ? ` <span style="color:#5a635e;">— ${escapeHtml(line.memo)}</span>` : ""}</li>`,
      );
    }
    blocks.push(`</ul>`);
  }

  if (opts.calendarLines.length > 0) {
    blocks.push(
      `<p style="margin:16px 0 6px;font-size:15px;font-weight:700;">【구글 캘린더】</p>`,
    );
    blocks.push(`<ul style="margin:0;padding-left:18px;">`);
    for (const c of opts.calendarLines) {
      blocks.push(
        `<li style="margin:0 0 8px;">${escapeHtml(formatBriefingCalendarLine(c))}${c.notes ? `<div style="font-size:13px;color:#6a7670;">${escapeHtml(c.notes)}</div>` : ""}</li>`,
      );
    }
    blocks.push(`</ul>`);
  }

  blocks.push(`</div>`);
  return blocks.join("");
}

export function buildDailyBriefing(
  tasks: Task[],
  calendarEvents: CalendarEvent[] = [],
  now = new Date(),
  guidelines: SideListItem[] = [],
  habits: SideListItem[] = [],
): DailyBriefing {
  const sorted = sortTasks(tasks);
  const completed = sortCompleted(tasks);
  // Always KST calendar day — UTC toISOString caused "하루 앞" 날짜
  const date = todayIsoKst(now);

  const focus = sorted.filter((t) => taskInBriefingWindow(t, date));
  // Today-only: do not fall back to all active tasks when nothing overlaps today
  const list = focus;

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
        deadlineLabel: formatDeadlineRange(t),
        importance: t.importance,
        importanceLabel: importanceLabel(t.importance),
        groupKey: t.groupKey,
        memo: t.memo,
        priorityTag: makePriorityTag(t.importance),
      }));
      return {
        kind,
        title: SECTION_TITLE[kind],
        summary: `${lines.length}건`,
        lines,
      };
    });

  const calendarLines = calendarEvents
    .filter((e) => eventOverlapsBriefingWeek(e, date))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({
      when: formatCalendarWhen(e),
      title: e.title,
      notes: e.notes,
    }));

  const guidelineLines = sideLines(guidelines);
  const habitLines = sideLines(habits);
  const openGuidelines = guidelineLines.filter((g) => !g.done).length;
  const openHabits = habitLines.filter((h) => !h.done).length;

  const headline = `일비서 브리핑 · ${formatKoDate(date)}`;
  const summaryLine = `할 일 ${list.length}건 · 지침 ${openGuidelines}건 · 습관 ${openHabits}건 · 캘린더 ${calendarLines.length}건`;

  const parts: string[] = [headline, summaryLine, "", "【할 일】"];

  const allLines = sections.flatMap((s) => s.lines);
  if (allLines.length === 0) {
    parts.push("(활성 할 일 없음)", "");
  } else {
    for (const cat of CATEGORY_ORDER) {
      const catLines = allLines.filter((l) => l.category === cat);
      if (catLines.length === 0) continue;
      parts.push(`〔${CATEGORY_LABEL[cat]}〕`);
      for (const line of catLines) {
        const meta = [
          line.priorityTag,
          line.kindLabel,
          line.deadlineLabel ? `기한 ${line.deadlineLabel}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        parts.push(`☐ ${line.title}`);
        if (meta) parts.push(`  ${meta}`);
        if (line.memo) parts.push(`  메모: ${line.memo}`);
      }
      parts.push("");
    }
  }

  if (guidelineLines.length > 0) {
    parts.push(`【${SIDE_LIST_LABEL.guideline}】`);
    for (const line of guidelineLines) {
      parts.push(`${line.done ? "☑" : "☐"} ${line.title}`);
      if (line.memo) parts.push(`  메모: ${line.memo}`);
    }
    parts.push("");
  }

  if (habitLines.length > 0) {
    parts.push(`【${SIDE_LIST_LABEL.habit}】`);
    for (const line of habitLines) {
      parts.push(`${line.done ? "☑" : "☐"} ${line.title}`);
      if (line.memo) parts.push(`  메모: ${line.memo}`);
    }
    parts.push("");
  }

  if (calendarLines.length > 0) {
    parts.push("【구글 캘린더】");
    for (const c of calendarLines) {
      parts.push(`• ${formatBriefingCalendarLine(c)}`);
      if (c.notes) parts.push(`  ${c.notes}`);
    }
  }

  const plaintext = parts.join("\n").trim() + "\n";
  const html = buildBriefingHtml({
    headline,
    summaryLine,
    allLines,
    guidelineLines,
    habitLines,
    calendarLines,
  });

  return {
    date,
    generatedAt: now.toISOString(),
    headline,
    summaryLine,
    sections,
    calendarLines,
    guidelineLines,
    habitLines,
    plaintext,
    html,
    activeCount: sorted.length,
    completedCount: completed.length,
  };
}

export const SETTINGS_KEY = "ilbiseo-settings-v1";

export type AppSettings = {
  /** Display / documentation — cron is fixed 08:00 KST */
  briefingHour: string;
  workEmail: string;
  /** When true, client syncs snapshot for Vercel/local cron */
  dailyEmailEnabled: boolean;
  /** Attach xlsx snapshot to outbound mail */
  attachXlsx: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  briefingHour: "08:00",
  workEmail: "goldage77@naver.com", // keep in sync with FATHER_EMAIL
  dailyEmailEnabled: false,
  attachXlsx: true,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const fresh = { ...DEFAULT_SETTINGS };
      saveSettings(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const next: AppSettings = {
      briefingHour: parsed.briefingHour || DEFAULT_SETTINGS.briefingHour,
      workEmail: (parsed.workEmail || "").trim() || DEFAULT_SETTINGS.workEmail,
      dailyEmailEnabled: Boolean(parsed.dailyEmailEnabled),
      attachXlsx:
        parsed.attachXlsx === undefined
          ? DEFAULT_SETTINGS.attachXlsx
          : Boolean(parsed.attachXlsx),
    };
    // Persist default email if older empty settings
    if (!(parsed.workEmail || "").trim() && next.workEmail) {
      saveSettings(next);
    }
    return next;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
