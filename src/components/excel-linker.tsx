"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  clearExcelHandle,
  DEFAULT_EXCEL_NAME,
  excelSaveToastMessage,
  saveExcelBuffer,
  supportsFileSystemAccess,
} from "@/lib/excel-link";
import { buildWorkbook, briefingFilename } from "@/lib/excel";
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
  onSync,
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
      const { buf, briefing } = await buildBuf();
      const result = await saveExcelBuffer(buf, {
        forceNewFile,
        suggestedName: fsOk
          ? DEFAULT_EXCEL_NAME
          : briefingFilename(briefing.date),
      });
      const msg = excelSaveToastMessage(result);
      if (msg) showToast(msg);
      if (result.mode === "overwrite" || result.mode === "created") {
        onLinkedChange(true);
        await onSync();
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
                ? "연결됨 — 「엑셀 파일 저장」은 같은 파일을 덮어씁니다. 할 일을 바꿔도 자동으로 갱신됩니다."
                : "처음에는 저장 위치와 이름을 고릅니다. 그다음부터는 같은 파일에 덮어씁니다. (Chrome·Edge PC)"
              : "이 브라우저는 같은 파일 덮어쓰기를 지원하지 않습니다. 저장 시 다운로드되며니다. PC Chrome·Edge를 쓰면 덮어쓰기가 됩니다."}
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
