"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task } from "@/lib/types";
import {
  buildDailyBriefing,
  loadSettings,
  saveSettings,
  type AppSettings,
  type DailyBriefing,
} from "@/lib/briefing";
import {
  buildBriefingWorkbook,
  briefingFilename,
  downloadXlsx,
} from "@/lib/excel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileSpreadsheet,
  Loader2,
  Newspaper,
  RefreshCw,
} from "lucide-react";

interface DailyBriefingPanelProps {
  tasks: Task[];
}

export function DailyBriefingPanel({ tasks }: DailyBriefingPanelProps) {
  const [settings, setSettings] = useState<AppSettings>({
    briefingHour: "07:30",
  });
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [busy, setBusy] = useState<"none" | "gen" | "xlsx" | "api">("none");
  const [apiNote, setApiNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const preview = useMemo(
    () => briefing ?? buildDailyBriefing(tasks),
    [briefing, tasks],
  );

  const generate = () => {
    setBusy("gen");
    setError(null);
    try {
      setBriefing(buildDailyBriefing(tasks));
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
      const b = buildDailyBriefing(tasks);
      setBriefing(b);
      const buf = await buildBriefingWorkbook(tasks, b);
      downloadXlsx(buf, briefingFilename(b.date));
    } catch (e) {
      setError(e instanceof Error ? e.message : "엑셀 내보내기 실패");
    } finally {
      setBusy("none");
    }
  };

  const dryRunApi = async () => {
    setBusy("api");
    setError(null);
    setApiNote(null);
    try {
      const res = await fetch("/api/daily-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks,
          send: false,
          preferredHour: settings.briefingHour,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        delivery?: { message: string };
        excel?: { filename: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "API dry-run 실패");
      }
      setBriefing(buildDailyBriefing(tasks));
      setApiNote(
        `스케줄러 dry-run 성공 · ${data.excel?.filename ?? "xlsx"} · ${data.delivery?.message ?? ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "API 호출 실패");
    } finally {
      setBusy("none");
    }
  };

  const onHourChange = (value: string) => {
    const next = { ...settings, briefingHour: value };
    setSettings(next);
    saveSettings(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--grid-line)] bg-[var(--sheet)] p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
            <Newspaper className="size-4 text-[var(--brand)]" />
            오늘 브리핑
          </p>
          <p className="text-sm text-[var(--ink-muted)]">
            스팟 → 지속 → 언젠가 순으로 읽기 쉬운 요약을 만듭니다. 매일 자동
            발송은 시각·채널 확정 후 연결합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="brief-hour" className="text-[11px] text-[var(--ink-muted)]">
              희망 발송 시각 (표시용)
            </Label>
            <Input
              id="brief-hour"
              type="time"
              value={settings.briefingHour}
              onChange={(e) => onHourChange(e.target.value)}
              className="h-8 w-[7.5rem]"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={generate}
            disabled={busy !== "none"}
          >
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
            {busy === "xlsx" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-3.5" />
            )}
            엑셀 저장
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={dryRunApi}
            disabled={busy !== "none"}
          >
            API dry-run
          </Button>
        </div>
      </div>

      <p className="text-[12px] text-[var(--ink-muted)]">
        예정: 매일{" "}
        <strong className="text-[var(--ink)]">{settings.briefingHour}</strong>{" "}
        (로컬에만 저장 · 실제 cron 없음) · 메일/문자 발송은 자격 증명·채널 확정
        전까지 dry-run만
      </p>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {apiNote ? (
        <p className="rounded-md border border-[var(--grid-line)] bg-[var(--group-bg)] px-3 py-2 text-sm text-[var(--ink)]">
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

        {preview.sections.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[var(--ink-muted)]">
            활성 할 일이 없습니다. TO DO에 일정을 넣은 뒤 「지금 생성」을 눌러
            주세요.
          </div>
        ) : (
          <div className="divide-y divide-[var(--grid-line)]">
            {preview.sections.map((section) => (
              <section key={section.kind} className="px-4 py-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--ink)]">
                    {section.title}
                  </h3>
                  <span className="text-[11px] text-[var(--ink-muted)]">
                    {section.summary}
                  </span>
                </div>
                <ul className="space-y-2">
                  {section.lines.map((line, i) => {
                    const showGroup =
                      line.groupKey &&
                      (i === 0 ||
                        section.lines[i - 1]?.groupKey !== line.groupKey);
                    return (
                      <li key={`${line.title}-${i}`}>
                        {showGroup ? (
                          <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--ink-muted)]">
                            묶음 · {line.groupKey}
                          </p>
                        ) : null}
                        <div className="flex flex-col gap-0.5 rounded-md bg-[var(--row-hover)] px-2.5 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--ink)]">
                              {line.priorityTag ? (
                                <span className="mr-1.5 text-[var(--accent-spot)]">
                                  {line.priorityTag}
                                </span>
                              ) : null}
                              {line.title}
                            </p>
                            {line.notes ? (
                              <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
                                {line.notes}
                              </p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-[11px] text-[var(--ink-muted)] sm:text-right">
                            <p>
                              {line.importanceLabel} · {line.urgencyLabel}
                            </p>
                            <p>
                              {line.targetDate
                                ? `기한 ${line.targetDate}`
                                : "기한 없음"}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <footer className="border-t border-[var(--grid-line)] bg-[var(--sheet-header)] px-4 py-2 text-[11px] text-[var(--ink-muted)]">
          엑셀에는 「오늘 브리핑」「브리핑 요약」「완료 기록」시트가 함께
          들어갑니다.
        </footer>
      </article>
    </div>
  );
}
