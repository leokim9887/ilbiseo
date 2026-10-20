"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, SideListItem, Task } from "@/lib/types";
import {
  buildDailyBriefing,
  loadSettings,
  saveSettings,
  type AppSettings,
  type DailyBriefing,
} from "@/lib/briefing";
import {
  formatNextBriefingKo,
  nextBriefingUtc,
} from "@/lib/schedule-kst";
import { FATHER_EMAIL } from "@/lib/father-mail";
import { PanelShell } from "@/components/panel-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Mail,
  Newspaper,
} from "lucide-react";

interface DailyBriefingPanelProps {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  guidelines?: SideListItem[];
  habits?: SideListItem[];
}

async function syncSnapshot(
  settings: AppSettings,
  payload: {
    tasks: Task[];
    calendarEvents: CalendarEvent[];
    guidelines: SideListItem[];
    habits: SideListItem[];
  },
) {
  const res = await fetch("/api/briefing-snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      workEmail: settings.workEmail,
      dailyEmailEnabled: settings.dailyEmailEnabled,
      attachXlsx: settings.attachXlsx,
    }),
  });
  return (await res.json()) as {
    ok: boolean;
    message?: string;
    store?: string;
    error?: string;
  };
}

export function DailyBriefingPanel({
  tasks,
  calendarEvents,
  guidelines = [],
  habits = [],
}: DailyBriefingPanelProps) {
  const [settings, setSettings] = useState<AppSettings>({
    briefingHour: "08:00",
    workEmail: FATHER_EMAIL,
    dailyEmailEnabled: false,
    attachXlsx: true,
  });
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [busy, setBusy] = useState<"none" | "api">("none");
  const [apiNote, setApiNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  /** Father-friendly: briefing body hidden until 「미리보기」; click again to hide. */
  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => {
    const loaded = loadSettings();
    const locked = { ...loaded, workEmail: FATHER_EMAIL };
    setSettings(locked);
    saveSettings(locked);
  }, []);

  const nextLabel = useMemo(
    () => formatNextBriefingKo(nextBriefingUtc(8, 0)),
    [],
  );

  const preview = useMemo(
    () =>
      briefing ??
      buildDailyBriefing(tasks, calendarEvents, undefined, guidelines, habits),
    [briefing, tasks, calendarEvents, guidelines, habits],
  );

  const persistSettings = (next: AppSettings) => {
    const locked = { ...next, workEmail: FATHER_EMAIL };
    setSettings(locked);
    saveSettings(locked);
  };

  // Keep server snapshot fresh when daily send is on
  useEffect(() => {
    if (!settings.dailyEmailEnabled) return;
    const t = setTimeout(() => {
      void syncSnapshot(settings, {
        tasks,
        calendarEvents,
        guidelines,
        habits,
      }).then((r) => {
        setSyncNote(
          r.ok
            ? `${r.message ? `메일용 저장됨 · ${r.message}` : "메일용 저장됨"}`
            : `동기화 실패 · ${r.error || r.message || ""}`,
        );
      });
    }, 800);
    return () => clearTimeout(t);
  }, [
    settings,
    tasks,
    calendarEvents,
    guidelines,
    habits,
  ]);

  /** Real Naver SMTP test send only — never called from 「미리보기」. */
  const sendTestMail = async () => {
    setBusy("api");
    setError(null);
    setApiNote(null);
    try {
      // Sync first so cron has latest data
      await syncSnapshot(settings, {
        tasks,
        calendarEvents,
        guidelines,
        habits,
      });
      const res = await fetch("/api/daily-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks,
          calendarEvents,
          guidelines,
          habits,
          send: true,
          preferredHour: "08:00",
          workEmail: settings.workEmail,
          attachXlsx: settings.attachXlsx,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        delivery?: { status: string; message: string; transport?: string };
        excel?: { filename: string };
        briefing?: { plaintext?: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "메일 요청에 실패했습니다");
      }
      setBriefing(
        buildDailyBriefing(
          tasks,
          calendarEvents,
          undefined,
          guidelines,
          habits,
        ),
      );
      setApiNote(
        `테스트 메일 · ${data.delivery?.message ?? data.delivery?.status ?? "완료"}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "메일 요청에 실패했습니다");
    } finally {
      setBusy("none");
    }
  };

  /** Local body toggle only — no API, no SMTP toast, no test-mail priming. */
  const togglePreview = () => {
    setPreviewVisible((open) => !open);
  };

  return (
    <PanelShell
      title="오늘 브리핑"
      description="매일 아침 8시 메일"
      icon={<Newspaper className="size-5" />}
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/50 px-4 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="work-email" className="text-[14px]">
              받는 메일
            </Label>
            <Input
              id="work-email"
              type="email"
              value={FATHER_EMAIL}
              readOnly
              aria-readonly="true"
              className="h-11 bg-[var(--sheet-header)] text-[var(--ink)]"
            />
          </div>

          <label className="flex items-start gap-3 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[var(--brand)]"
              checked={settings.dailyEmailEnabled}
              onChange={(e) =>
                persistSettings({
                  ...settings,
                  dailyEmailEnabled: e.target.checked,
                })
              }
            />
            <span>
              <span className="font-semibold">매일 아침 8시 자동 발송</span>
              <span className="mt-0.5 block text-[13px] text-[var(--ink-muted)]">
                켜면 아침마다 메일을 보냅니다.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[var(--brand)]"
              checked={settings.attachXlsx}
              onChange={(e) =>
                persistSettings({
                  ...settings,
                  attachXlsx: e.target.checked,
                })
              }
            />
            <span>
              <span className="font-semibold">엑셀 첨부</span>
            </span>
          </label>

          <p className="text-[14px] text-[var(--ink)]">
            다음 예정:{" "}
            <strong className="tabular-nums">{nextLabel}</strong>
            <span className="text-[var(--ink-muted)]"> (한국 시간 08:00)</span>
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              onClick={() => void sendTestMail()}
              disabled={busy !== "none"}
            >
              {busy === "api" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              테스트 메일 보내기
            </Button>
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              variant="outline"
              onClick={togglePreview}
              aria-pressed={previewVisible}
            >
              미리보기
            </Button>
          </div>

          <p className="text-[13px] text-[var(--ink-muted)]">
            {FATHER_EMAIL} · 매일 발송{" "}
            {settings.dailyEmailEnabled ? "켜짐" : "꺼짐"}
          </p>
          {syncNote ? (
            <p className="text-[13px] text-[var(--ink-muted)]">{syncNote}</p>
          ) : null}
        </div>

        {error ? (
          <p
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {apiNote ? (
          <p className="rounded-xl border border-[var(--grid-line)] bg-[var(--group-bg)] px-3 py-2 text-sm">
            {apiNote}
          </p>
        ) : null}

        {previewVisible ? (
          <article
            className="overflow-hidden rounded-xl border border-[var(--grid-line)]"
            data-briefing-preview="shown"
          >
            <header className="border-b border-[var(--grid-line)] bg-[var(--sheet-header)] px-4 py-3">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--brand)]">
                {preview.headline}
              </h3>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                {preview.summaryLine}
              </p>
            </header>

            <div className="divide-y divide-[var(--grid-line)]">
              <section className="px-4 py-3">
                <h4 className="mb-2 text-sm font-semibold text-[#217346]">
                  【할 일】
                </h4>
                {preview.sections.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">할 일 없음</p>
                ) : (
                  preview.sections.map((section) => (
                    <div key={section.kind} className="mb-3">
                      <p className="mb-1 text-sm font-medium">
                        {section.title}{" "}
                        <span className="text-[13px] text-[var(--ink-muted)]">
                          {section.summary}
                        </span>
                      </p>
                      <ul className="space-y-1.5">
                        {section.lines.map((line, i) => (
                          <li
                            key={`${line.title}-${i}`}
                            className="rounded-lg bg-[var(--row-hover)] px-3 py-2.5 text-sm"
                          >
                            <p className="font-medium">
                              ☐{" "}
                              {line.priorityTag ? (
                                <span className="text-[var(--accent-spot)]">
                                  {line.priorityTag}{" "}
                                </span>
                              ) : null}
                              {line.title}
                            </p>
                            <p className="text-[13px] text-[var(--ink-muted)]">
                              {line.categoryLabel} · {line.importanceLabel}
                              {line.targetDate
                                ? ` · 기한 ${line.targetDate}`
                                : ""}
                            </p>
                            {line.memo ? (
                              <p className="text-[13px] text-[var(--ink-muted)]">
                                메모: {line.memo}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </section>

              {preview.guidelineLines.length > 0 ? (
                <section className="px-4 py-3">
                  <h4 className="mb-2 text-sm font-semibold text-[#3b6ea5]">
                    【지침】
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {preview.guidelineLines.map((g, i) => (
                      <li key={`g-${i}`}>
                        {g.done ? "☑" : "☐"} {g.title}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {preview.habitLines.length > 0 ? (
                <section className="px-4 py-3">
                  <h4 className="mb-2 text-sm font-semibold text-[#2d7a4f]">
                    【습관】
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {preview.habitLines.map((h, i) => (
                      <li key={`h-${i}`}>
                        {h.done ? "☑" : "☐"} {h.title}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {preview.calendarLines.length > 0 ? (
                <section className="px-4 py-3">
                  <h4 className="mb-2 text-sm font-semibold text-[#3b6ea5]">
                    【구글 캘린더】
                  </h4>
                  <ul className="space-y-1.5">
                    {preview.calendarLines.map((c, i) => (
                      <li key={`${c.title}-${i}`} className="text-sm">
                        <span className="text-[var(--ink-muted)]">{c.when}</span>{" "}
                        {c.title}
                        {c.calendarName ? (
                          <span className="text-[var(--ink-muted)]">
                            {" "}
                            · {c.calendarName}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </article>
        ) : null}
      </div>
    </PanelShell>
  );
}
