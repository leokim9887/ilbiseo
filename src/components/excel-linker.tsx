"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  clearExcelHandle,
  pickExcelFile,
  supportsFileSystemAccess,
} from "@/lib/excel-link";
import { buildWorkbook, briefingFilename, downloadXlsx } from "@/lib/excel";
import { buildDailyBriefing } from "@/lib/briefing";
import type { AppState } from "@/lib/types";
import { FileSpreadsheet, Link2, Unlink } from "lucide-react";

interface ExcelLinkerProps {
  state: AppState;
  linked: boolean;
  status: string | null;
  onLinkedChange: (linked: boolean) => void;
  onSync: () => Promise<void>;
}

export function ExcelLinker({
  state,
  linked,
  status,
  onLinkedChange,
  onSync,
}: ExcelLinkerProps) {
  const [busy, setBusy] = useState(false);
  const fsOk = supportsFileSystemAccess();

  const link = async () => {
    setBusy(true);
    try {
      const handle = await pickExcelFile();
      if (!handle) {
        const briefing = buildDailyBriefing(
          state.tasks,
          state.calendarEvents,
          undefined,
          state.guidelines,
          state.habits,
        );
        const buf = await buildWorkbook({
          tasks: state.tasks,
          calendarEvents: state.calendarEvents,
          briefing,
          guidelines: state.guidelines,
          habits: state.habits,
        });
        downloadXlsx(buf, briefingFilename(briefing.date));
        return;
      }
      onLinkedChange(true);
      await onSync();
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    await clearExcelHandle();
    onLinkedChange(false);
  };

  const download = async () => {
    setBusy(true);
    try {
      const briefing = buildDailyBriefing(
        state.tasks,
        state.calendarEvents,
        undefined,
        state.guidelines,
        state.habits,
      );
      const buf = await buildWorkbook({
        tasks: state.tasks,
        calendarEvents: state.calendarEvents,
        briefing,
        guidelines: state.guidelines,
        habits: state.habits,
      });
      downloadXlsx(buf, briefingFilename(briefing.date));
      await onSync();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/60 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[var(--group-bg)] p-2 text-[var(--brand)]">
          <FileSpreadsheet className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">
            PC 엑셀 파일 연결
          </p>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            {fsOk
              ? linked
                ? "연결됨 — 할 일·한 일을 바꾸면 같은 파일이 덮어쓰기됩니다."
                : "아버지 PC Chrome에서 파일을 고르면 입력할 때마다 갱신됩니다."
              : "이 브라우저는 파일 연결을 지원하지 않습니다. 「지금 저장/다운로드」를 쓰세요."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="lg"
          className="min-h-11"
          variant="secondary"
          disabled={busy}
          onClick={link}
        >
          <Link2 className="size-4" />
          엑셀 파일 연결
        </Button>
        <Button
          type="button"
          size="lg"
          className="min-h-11"
          variant="outline"
          disabled={busy}
          onClick={download}
        >
          지금 저장/다운로드
        </Button>
        {linked ? (
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            variant="ghost"
            onClick={unlink}
          >
            <Unlink className="size-4" />
            연결 해제
          </Button>
        ) : null}
      </div>
      {status ? (
        <p className="text-[12px] text-[var(--ink-muted)]">{status}</p>
      ) : null}
    </div>
  );
}
