"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  clearExcelHandle,
  datedExcelFilename,
  excelSaveToastMessage,
  saveExcelBuffer,
  supportsFileSystemAccess,
} from "@/lib/excel-link";
import { buildWorkbook } from "@/lib/excel";
import { buildDailyBriefing } from "@/lib/briefing";
import type { AppState } from "@/lib/types";
import { FileSpreadsheet, Save, Unlink } from "lucide-react";

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
  onSync: _onSync,
}: ExcelLinkerProps) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsOk = supportsFileSystemAccess();

  const showToast = (text: string | null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    if (text) {
      toastTimer.current = setTimeout(() => setToast(null), 3200);
    }
  };

  const buildBuf = async () => {
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
    return { buf, briefing };
  };

  const save = async (forceNewFile: boolean) => {
    setBusy(true);
    try {
      const { buf } = await buildBuf();
      const result = await saveExcelBuffer(buf, {
        forceNewFile,
        // Always stamp today’s KST date (picker + overwrite rename).
        suggestedName: datedExcelFilename(),
      });
      const msg = excelSaveToastMessage(result);
      if (msg) showToast(msg);
      if (result.mode === "overwrite" || result.mode === "created") {
        // Content already written — do not write again via onSync (race / lock).
        onLinkedChange(true);
      } else if (result.mode === "error" && result.kind === "not_found") {
        onLinkedChange(false);
      }
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "엑셀 저장에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    await clearExcelHandle();
    onLinkedChange(false);
    showToast("엑셀 파일 연결을 해제했습니다");
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/60 px-4 py-4">
      {toast ? (
        <div
          className="fixed left-1/2 top-3 z-50 w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl border border-[var(--brand)]/30 bg-[var(--sheet)] px-4 py-3 text-center text-[15px] text-[var(--brand)] shadow-md"
          role="status"
        >
          {toast}
        </div>
      ) : null}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[var(--group-bg)] p-2 text-[var(--brand)]">
          <FileSpreadsheet className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">
            엑셀 파일 저장
          </p>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            {fsOk
              ? linked
                ? "저장할 때마다 오늘 날짜 이름으로 맞춥니다. 엑셀을 닫고 저장하세요."
                : "처음만 위치를 고릅니다. 파일 이름에 오늘 날짜가 들어갑니다."
              : "이 브라우저에서는 오늘 날짜 이름으로 내려받습니다."}
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
          onClick={() => void save(false)}
        >
          <Save className="size-4" />
          엑셀 파일 저장
        </Button>
        {fsOk ? (
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            variant="outline"
            disabled={busy}
            onClick={() => void save(true)}
          >
            <FileSpreadsheet className="size-4" />
            다른 이름으로 저장
          </Button>
        ) : null}
        {linked ? (
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            variant="ghost"
            onClick={() => void unlink()}
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
