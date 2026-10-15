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
  const [busy, setBusy] = useState<"none" | "api" | "sync">("none");
  const [apiNote, setApiNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

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
            ? `서버 동기화됨 · ${r.message ?? ""}`
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

  const callApi = async (send: boolean) => {
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
          send,
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
        throw new Error(data.error || "API 호출 실패");
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
        send
          ? `테스트 메일 · ${data.delivery?.message ?? data.delivery?.status ?? "완료"}`
          : `미리보기 · ${data.delivery?.message ?? "발송하지 않음"}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "API 호출 실패");
    } finally {
      setBusy("none");
    }
  };

  const forceSync = async () => {
    setBusy("sync");
    setError(null);
    try {
      const r = await syncSnapshot(settings, {
        tasks,
        calendarEvents,
        guidelines,
        habits,
      });
      setSyncNote(
        r.ok
          ? `서버 동기화됨 · ${r.message ?? ""}`
          : `동기화 실패 · ${r.error || r.message || ""}`,
      );
      if (!r.ok) setError(r.error || r.message || "동기화 실패");
    } finally {
      setBusy("none");
    }
  };

  return (
    <PanelShell
      title="오늘 브리핑 · 매일 메일"
      description="매일 아침 08:00(한국 시간) 네이버 메일."
      icon={<Newspaper className="size-5" />}
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/50 px-4 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="work-email" className="text-[14px]">
              아버지 메일 (고정)
            </Label>
            <Input
              id="work-email"
              type="email"
              value={FATHER_EMAIL}
              readOnly
              aria-readonly="true"
              className="h-11 bg-[var(--sheet-header)] text-[var(--ink)]"
            />
            <p className="text-[13px] text-[var(--ink-muted)]">
              발신·수신 모두 {FATHER_EMAIL}
            </p>
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
              <span className="font-semibold">매일 08:00(KST) 자동 발송</span>
              <span className="mt-0.5 block text-[13px] text-[var(--ink-muted)]">
                켜면 이 기기의 할 일·캘린더를 서버에 맞춰 아침 메일을 보냅니다.
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
              <span className="font-semibold">엑셀(xlsx) 첨부</span>
              <span className="mt-0.5 block text-[13px] text-[var(--ink-muted)]">
                당일 스냅샷 파일을 메일 첨부합니다.
              </span>
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
              onClick={() => callApi(true)}
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
              onClick={() => callApi(false)}
              disabled={busy !== "none"}
            >
              미리보기(발송 안 함)
            </Button>
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              variant="outline"
              onClick={forceSync}
              disabled={busy !== "none"}
            >
              {busy === "sync" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              서버에 지금 동기화
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

        <article className="overflow-hidden rounded-xl border border-[var(--grid-line)]">
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
                <p className="text-sm text-[var(--ink-muted)]">활성 할 일 없음</p>
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
                            {line.targetDate ? ` · 기한 ${line.targetDate}` : ""}
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
      </div>
    </PanelShell>
  );
}
