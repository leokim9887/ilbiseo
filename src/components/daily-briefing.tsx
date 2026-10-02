"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent, ChecklistItem, Task } from "@/lib/types";
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
  checklists: ChecklistItem[];
  calendarEvents: CalendarEvent[];
  onAfterExport?: () => void;
}

export function DailyBriefingPanel({
  tasks,
  checklists,
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
    () => briefing ?? buildDailyBriefing(tasks, checklists, calendarEvents),
    [briefing, tasks, checklists, calendarEvents],
  );

  const persistSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const generate = () => {
    setBusy("gen");
    setError(null);
    try {
      setBriefing(buildDailyBriefing(tasks, checklists, calendarEvents));
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
      const b = buildDailyBriefing(tasks, checklists, calendarEvents);
      setBriefing(b);
      const buf = await buildWorkbook({
        tasks,
        checklists,
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
          checklists,
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
      setBriefing(buildDailyBriefing(tasks, checklists, calendarEvents));
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--grid-line)] bg-[var(--sheet)] p-4">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
            <Newspaper className="size-4 text-[var(--brand)]" />
            오늘 브리핑 (매일 08:00 KST 목표)
          </p>
          <p className="text-sm text-[var(--ink-muted)]">
            할 일 · 체크리스트 · 구글 캘린더를 구분해서 읽기 쉽게 정리합니다.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="brief-hour" className="text-[11px]">
              발송 시각 (표시·cron용)
            </Label>
            <Input
              id="brief-hour"
              type="time"
              value={settings.briefingHour}
              onChange={(e) =>
                persistSettings({ ...settings, briefingHour: e.target.value })
              }
              className="h-8"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="work-email" className="text-[11px]">
              아버지 업무용 이메일 (비우면 dry-run만)
            </Label>
            <Input
              id="work-email"
              type="email"
              placeholder="work@example.com"
              value={settings.workEmail}
              onChange={(e) =>
                persistSettings({ ...settings, workEmail: e.target.value })
              }
              className="h-8"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={generate} disabled={busy !== "none"}>
            {busy === "gen" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            지금 생성
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={exportExcel}
            disabled={busy !== "none"}
          >
            <FileSpreadsheet className="size-3.5" />
            엑셀 저장
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => dryRunApi(false)}
            disabled={busy !== "none"}
          >
            API dry-run
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => dryRunApi(true)}
            disabled={busy !== "none"}
          >
            <Mail className="size-3.5" />
            메일 시도
          </Button>
        </div>
        <p className="text-[12px] text-[var(--ink-muted)]">
          기본 {settings.briefingHour} · 주소{" "}
          {settings.workEmail || "(미입력 → 발송 안 함)"} · Resend/SMTP 없으면
          dry-run
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {apiNote ? (
        <p className="rounded-md border border-[var(--grid-line)] bg-[var(--group-bg)] px-3 py-2 text-sm">
          {apiNote}
        </p>
      ) : null}

      <article className="overflow-hidden border border-[var(--grid-line)] bg-[var(--sheet)]">
        <header className="border-b border-[var(--grid-line)] bg-[var(--sheet-header)] px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--brand)]">
            {preview.headline}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {preview.summaryLine}
          </p>
        </header>

        <div className="divide-y divide-[var(--grid-line)]">
          <section className="px-4 py-3">
            <h3 className="mb-2 text-sm font-semibold">【일비서 할 일】</h3>
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
                        className="rounded-md bg-[var(--row-hover)] px-2.5 py-2 text-sm"
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
            <h3 className="mb-2 text-sm font-semibold">【체크리스트】</h3>
            {preview.checklistSections.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">항목 없음</p>
            ) : (
              preview.checklistSections.map((sec) => (
                <div key={sec.category} className="mb-2">
                  <p className="text-[11px] font-semibold text-[var(--ink-muted)]">
                    〔{sec.categoryLabel}〕
                  </p>
                  <ul className="mt-1 space-y-1">
                    {sec.items.map((item, i) => (
                      <li key={`${item.title}-${i}`} className="text-sm">
                        {item.checked ? "☑" : "☐"} {item.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <section className="px-4 py-3">
            <h3 className="mb-2 text-sm font-semibold text-[var(--brand)]">
              【구글 캘린더 — 별도】
            </h3>
            {preview.calendarLines.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">근접 일정 없음</p>
            ) : (
              <ul className="space-y-1.5">
                {preview.calendarLines.map((c, i) => (
                  <li key={`${c.title}-${i}`} className="text-sm">
                    <span className="text-[var(--ink-muted)]">{c.when}</span>{" "}
                    {c.title}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </article>
    </div>
  );
}
