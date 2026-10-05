"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, Task } from "@/lib/types";
import {
  buildDailyBriefing,
  loadSettings,
  saveSettings,
  type AppSettings,
  type DailyBriefing,
} from "@/lib/briefing";
import {
  buildWorkbook,
  briefingFilename,
  downloadXlsx,
} from "@/lib/excel";
import { PanelShell } from "@/components/panel-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileSpreadsheet,
  Loader2,
  Mail,
  Newspaper,
  RefreshCw,
} from "lucide-react";

interface DailyBriefingPanelProps {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  onAfterExport?: () => void;
}

export function DailyBriefingPanel({
  tasks,
  calendarEvents,
  onAfterExport,
}: DailyBriefingPanelProps) {
  const [settings, setSettings] = useState<AppSettings>({
    briefingHour: "08:00",
    workEmail: "",
  });
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [busy, setBusy] = useState<"none" | "gen" | "xlsx" | "api">("none");
  const [apiNote, setApiNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const preview = useMemo(
    () => briefing ?? buildDailyBriefing(tasks, calendarEvents),
    [briefing, tasks, calendarEvents],
  );

  const persistSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const generate = () => {
    setBusy("gen");
    setError(null);
    try {
      setBriefing(buildDailyBriefing(tasks, calendarEvents));
      setApiNote(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "브리핑 생성 실패");
    } finally {
      setBusy("none");
    }
  };

  const exportExcel = async () => {
    setBusy("xlsx");
    setError(null);
    try {
      const b = buildDailyBriefing(tasks, calendarEvents);
      setBriefing(b);
      const buf = await buildWorkbook({
        tasks,
        calendarEvents,
        briefing: b,
      });
      downloadXlsx(buf, briefingFilename(b.date));
      onAfterExport?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "엑셀 내보내기 실패");
    } finally {
      setBusy("none");
    }
  };

  const dryRunApi = async (send: boolean) => {
    setBusy("api");
    setError(null);
    setApiNote(null);
    try {
      const res = await fetch("/api/daily-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks,
          calendarEvents,
          send,
          preferredHour: settings.briefingHour,
          workEmail: settings.workEmail,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        delivery?: { status: string; message: string };
        excel?: { filename: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "API 호출 실패");
      }
      setBriefing(buildDailyBriefing(tasks, calendarEvents));
      setApiNote(
        `${send ? "발송 시도" : "dry-run"} · ${data.delivery?.status} · ${data.delivery?.message}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "API 호출 실패");
    } finally {
      setBusy("none");
    }
  };

  return (
    <PanelShell
      title="오늘 브리핑"
      description="매일 08:00(KST) 목표. 할 일과 구글 캘린더를 구분해서 읽기 쉽게 정리합니다."
      icon={<Newspaper className="size-5" />}
      actions={
        <>
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            onClick={generate}
            disabled={busy !== "none"}
          >
            {busy === "gen" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            지금 생성
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            variant="secondary"
            onClick={exportExcel}
            disabled={busy !== "none"}
          >
            <FileSpreadsheet className="size-4" />
            엑셀 저장
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="brief-hour" className="text-xs">
              발송 시각 (표시·cron용)
            </Label>
            <Input
              id="brief-hour"
              type="time"
              value={settings.briefingHour}
              onChange={(e) =>
                persistSettings({ ...settings, briefingHour: e.target.value })
              }
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="work-email" className="text-xs">
              업무용 이메일 (비우면 dry-run만)
            </Label>
            <Input
              id="work-email"
              type="email"
              placeholder="work@example.com"
              value={settings.workEmail}
              onChange={(e) =>
                persistSettings({ ...settings, workEmail: e.target.value })
              }
              className="h-11"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            variant="outline"
            onClick={() => dryRunApi(false)}
            disabled={busy !== "none"}
          >
            API dry-run
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            variant="outline"
            onClick={() => dryRunApi(true)}
            disabled={busy !== "none"}
          >
            <Mail className="size-4" />
            메일 시도
          </Button>
        </div>

        <p className="text-[12px] text-[var(--ink-muted)]">
          기본 {settings.briefingHour} · 주소{" "}
          {settings.workEmail || "(미입력 → 발송 안 함)"} · Resend/SMTP 없으면
          dry-run
        </p>

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
              <h4 className="mb-2 text-sm font-semibold">【일비서 할 일】</h4>
              {preview.sections.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">활성 할 일 없음</p>
              ) : (
                preview.sections.map((section) => (
                  <div key={section.kind} className="mb-3">
                    <p className="mb-1 text-sm font-medium">
                      {section.title}{" "}
                      <span className="text-[11px] text-[var(--ink-muted)]">
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
                          <p className="text-[11px] text-[var(--ink-muted)]">
                            {line.categoryLabel} · {line.importanceLabel} ·{" "}
                            {line.urgencyLabel}
                            {line.targetDate ? ` · 기한 ${line.targetDate}` : ""}
                          </p>
                          {line.memo ? (
                            <p className="text-[11px] text-[var(--ink-muted)]">
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

            <section className="px-4 py-3">
              <h4 className="mb-2 text-sm font-semibold text-[var(--brand)]">
                【구글 캘린더】
              </h4>
              {preview.calendarLines.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">근접 일정 없음</p>
              ) : (
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
              )}
            </section>
          </div>
        </article>
      </div>
    </PanelShell>
  );
}
