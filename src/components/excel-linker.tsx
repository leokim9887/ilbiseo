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
        // fallback download
        const briefing = buildDailyBriefing(
          state.tasks,
          state.checklists,
          state.calendarEvents,
        );
        const buf = await buildWorkbook({
          tasks: state.tasks,
          checklists: state.checklists,
          calendarEvents: state.calendarEvents,
          briefing,
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
        state.checklists,
        state.calendarEvents,
      );
      const buf = await buildWorkbook({
        tasks: state.tasks,
        checklists: state.checklists,
        calendarEvents: state.calendarEvents,
        briefing,
      });
      downloadXlsx(buf, briefingFilename(briefing.date));
      await onSync();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--grid-line)] bg-[var(--sheet-header)] px-3 py-2 text-sm">
      <FileSpreadsheet className="size-4 text-[var(--brand)]" />
      <span className="text-[var(--ink-muted)]">
        {fsOk
          ? linked
            ? "엑셀 연결됨 — 변경 시 PC 파일 갱신"
            : "PC 엑셀 파일 연결 (File System Access)"
          : "이 브라우저는 파일 연결 미지원 — 다운로드로 저장"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={link}
      >
        <Link2 className="size-3.5" />
        엑셀 파일 연결
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={download}
      >
        지금 저장/다운로드
      </Button>
      {linked ? (
        <Button type="button" size="sm" variant="ghost" onClick={unlink}>
          <Unlink className="size-3.5" />
          연결 해제
        </Button>
      ) : null}
      {status ? (
        <span className="text-[11px] text-[var(--ink-muted)]">{status}</span>
      ) : null}
    </div>
  );
}
