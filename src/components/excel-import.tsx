"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  applySavedOrAuto,
  buildPreviewRows,
  IMPORT_FIELD_LABEL,
  IMPORT_TARGET_FIELDS,
  isIlbiseoTemplate,
  loadSavedMapping,
  mappingHasTitle,
  parseExcelFile,
  pickDefaultSheetIndex,
  saveMapping,
  sheetToTasks,
  type ColumnMapping,
  type ImportField,
  type ParsedSheet,
  type ParsedWorkbook,
} from "@/lib/excel-import";
import type { Task, TaskCategory } from "@/lib/types";
import { FileSpreadsheet, Loader2 } from "lucide-react";

type Step = "pick" | "sheet" | "map" | "preview";
type ImportMode = "merge" | "replace";

interface ExcelImportProps {
  onImport: (tasks: Task[]) => void;
  onReplaceCategory?: (category: TaskCategory, tasks: Task[]) => void;
  category: TaskCategory;
}

export function ExcelImport({
  onImport,
  onReplaceCategory,
  category,
}: ExcelImportProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mode, setMode] = useState<ImportMode>("merge");
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sheet: ParsedSheet | null = workbook?.sheets[sheetIndex] ?? null;

  const preview = useMemo(() => {
    if (!sheet) return [];
    return buildPreviewRows(sheet, mapping, category);
  }, [sheet, mapping, category]);

  const usableCount = preview.filter((r) => !r.skip).length;

  const reset = () => {
    setStep("pick");
    setBusy(false);
    setError(null);
    setWorkbook(null);
    setSheetIndex(0);
    setMapping({});
    setMode("merge");
    setReplaceConfirm(false);
    setShowReplace(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const goAfterSheet = (wb: ParsedWorkbook, idx: number) => {
    const s = wb.sheets[idx];
    if (!s) {
      setError("시트를 찾지 못했습니다.");
      return;
    }
    const saved = loadSavedMapping();
    const nextMap = applySavedOrAuto(s.headers, saved);
    setMapping(nextMap);
    if (isIlbiseoTemplate(s.headers) && mappingHasTitle(nextMap)) {
      setStep("preview");
    } else {
      setStep("map");
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const wb = await parseExcelFile(file);
      setWorkbook(wb);
      const idx = pickDefaultSheetIndex(wb.sheets);
      setSheetIndex(idx);
      if (wb.sheets.length > 1) {
        setStep("sheet");
      } else {
        goAfterSheet(wb, idx);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
      setStep("pick");
    } finally {
      setBusy(false);
    }
  };

  const setFieldMapping = (header: string, field: ImportField) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (field !== "skip") {
        for (const [h, f] of Object.entries(next)) {
          if (f === field && h !== header) next[h] = "skip";
        }
      }
      next[header] = field;
      return next;
    });
  };

  const handleCommit = () => {
    if (!sheet) return;
    if (!mappingHasTitle(mapping)) {
      setError("「할 일」열을 하나 지정해 주세요.");
      return;
    }
    if (usableCount === 0) {
      setError("가져올 할 일이 없습니다.");
      return;
    }
    if (mode === "replace") {
      if (!replaceConfirm) {
        setError("바꾸려면 「정말 바꿀게요」를 체크해 주세요.");
        return;
      }
      if (!onReplaceCategory) {
        setError("바꾸기를 쓸 수 없습니다.");
        return;
      }
    }

    try {
      const tasks = sheetToTasks(sheet, mapping, category);
      if (tasks.length === 0) {
        setError("가져올 할 일이 없습니다.");
        return;
      }
      saveMapping(mapping);
      if (mode === "replace" && onReplaceCategory) {
        onReplaceCategory(category, tasks);
      } else {
        onImport(tasks);
      }
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기 실패");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 min-h-11 touch-manipulation rounded-sm border-[#8a939a] bg-white px-3 sm:h-9 sm:min-h-9"
            data-excel-import
          >
            <FileSpreadsheet className="size-3.5" />
            엑셀 불러오기
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>엑셀 불러오기</DialogTitle>
          <DialogDescription>
            현재 틀에 추가합니다. (.xlsx · .xls · .csv)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          {step === "pick" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              className="h-11 w-full touch-manipulation text-[15px]"
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-4" />
              )}
              {busy ? "읽는 중…" : "파일 선택"}
            </Button>
          ) : null}

          {step === "sheet" && workbook ? (
            <div className="space-y-2">
              <p className="text-[14px] text-[var(--ink)]">시트 선택</p>
              <select
                value={sheetIndex}
                onChange={(e) => setSheetIndex(Number(e.target.value))}
                className="h-11 w-full rounded-sm border border-[#8a939a] bg-white px-2.5 text-[15px]"
                aria-label="가져올 시트"
              >
                {workbook.sheets.map((s, i) => (
                  <option key={`${s.name}-${i}`} value={i}>
                    {s.name} ({s.rows.length}행)
                  </option>
                ))}
              </select>
              <Button
                type="button"
                className="h-11 w-full touch-manipulation"
                onClick={() => goAfterSheet(workbook, sheetIndex)}
              >
                다음
              </Button>
            </div>
          ) : null}

          {step === "map" && sheet ? (
            <div className="space-y-2">
              <p className="text-[13px] text-[var(--ink-muted)]">
                열이 달라요. 아빠 열 → 우리 칸
              </p>
              <div className="overflow-x-auto rounded-sm border border-[#9aa5ad]">
                <table className="w-full min-w-[280px] text-left text-[14px]">
                  <thead className="bg-[#f3f3f3]">
                    <tr>
                      <th className="border-b border-[#9aa5ad] px-2 py-1.5 font-semibold">
                        아빠 열
                      </th>
                      <th className="border-b border-[#9aa5ad] px-2 py-1.5 font-semibold">
                        우리 칸
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.headers.map((h) => (
                      <tr key={h} className="border-b border-[#d0d5d9]">
                        <td className="px-2 py-1.5 align-middle">{h}</td>
                        <td className="px-2 py-1.5">
                          <select
                            value={mapping[h] ?? "skip"}
                            onChange={(e) =>
                              setFieldMapping(
                                h,
                                e.target.value as ImportField,
                              )
                            }
                            className="h-9 w-full min-w-[7.5rem] rounded-sm border border-[#8a939a] bg-white px-2 text-[14px]"
                            aria-label={`${h} 매핑`}
                          >
                            <option value="skip">
                              {IMPORT_FIELD_LABEL.skip}
                            </option>
                            {IMPORT_TARGET_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {IMPORT_FIELD_LABEL[f]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!mappingHasTitle(mapping) ? (
                <p className="text-[13px] text-destructive">
                  「할 일」열을 골라 주세요.
                </p>
              ) : null}
              <Button
                type="button"
                className="h-11 w-full touch-manipulation"
                disabled={!mappingHasTitle(mapping)}
                onClick={() => {
                  setError(null);
                  setStep("preview");
                }}
              >
                미리보기
              </Button>
            </div>
          ) : null}

          {step === "preview" && sheet ? (
            <div className="space-y-2">
              <p className="text-[14px] font-medium text-[var(--ink)]">
                {usableCount}건 · 기존 목록에 추가
              </p>

              {usableCount === 0 ? (
                <div className="rounded-sm border border-dashed border-[#9aa5ad] bg-[#f7f8f9] px-3 py-6 text-center text-[14px] text-[var(--ink-muted)]">
                  가져올 행이 없습니다.
                </div>
              ) : (
                <div className="max-h-44 overflow-auto rounded-sm border border-[#9aa5ad]">
                  <table className="w-full min-w-[360px] text-left text-[13px]">
                    <thead className="sticky top-0 bg-[#f3f3f3]">
                      <tr>
                        <th className="border-b border-[#9aa5ad] px-2 py-1">
                          할 일
                        </th>
                        <th className="border-b border-[#9aa5ad] px-2 py-1">
                          마감
                        </th>
                        <th className="border-b border-[#9aa5ad] px-2 py-1">
                          중요
                        </th>
                        <th className="border-b border-[#9aa5ad] px-2 py-1">
                          시급
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview
                        .filter((r) => !r.skip)
                        .slice(0, 30)
                        .map((r, i) => (
                          <tr
                            key={`${r.title}-${i}`}
                            className="border-b border-[#e0e4e7]"
                          >
                            <td className="max-w-[12rem] truncate px-2 py-1">
                              {r.title}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1">
                              {r.deadlineLabel}
                            </td>
                            <td className="px-2 py-1">{r.importance}</td>
                            <td className="px-2 py-1">{r.urgency}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!showReplace ? (
                <button
                  type="button"
                  className="text-[13px] text-[var(--ink-muted)] underline-offset-2 hover:underline"
                  onClick={() => setShowReplace(true)}
                >
                  목록 비우고 바꾸기…
                </button>
              ) : (
                <div className="space-y-2 rounded-sm border border-[#b42318]/30 bg-[#fff8f7] px-2.5 py-2">
                  <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                    <input
                      type="radio"
                      className="mt-0.5"
                      checked={mode === "merge"}
                      onChange={() => {
                        setMode("merge");
                        setReplaceConfirm(false);
                        setError(null);
                      }}
                    />
                    <span>기존에 추가 (기본)</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                    <input
                      type="radio"
                      className="mt-0.5"
                      checked={mode === "replace"}
                      onChange={() => {
                        setMode("replace");
                        setError(null);
                      }}
                    />
                    <span>현재 틀을 이 목록으로 바꾸기</span>
                  </label>
                  {mode === "replace" ? (
                    <label className="flex cursor-pointer items-start gap-2 text-[13px] text-[#b42318]">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={replaceConfirm}
                        onChange={(e) => {
                          setReplaceConfirm(e.target.checked);
                          setError(null);
                        }}
                      />
                      <span>정말 바꿀게요</span>
                    </label>
                  ) : null}
                </div>
              )}

              <button
                type="button"
                className="text-[13px] text-[var(--ink-muted)] underline-offset-2 hover:underline"
                onClick={() => {
                  setError(null);
                  if (sheet && !isIlbiseoTemplate(sheet.headers)) {
                    setStep("map");
                  } else {
                    reset();
                    setStep("pick");
                  }
                }}
              >
                {sheet && !isIlbiseoTemplate(sheet.headers)
                  ? "열 다시 맞추기"
                  : "다른 파일"}
              </button>
            </div>
          ) : null}

          {error ? (
            <p className="text-[13px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 touch-manipulation"
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          {step === "preview" ? (
            <Button
              type="button"
              className="h-11 touch-manipulation bg-[#217346] text-white hover:bg-[#1a5c38]"
              disabled={usableCount === 0 || busy}
              onClick={handleCommit}
            >
              {mode === "replace"
                ? `${usableCount}건으로 바꾸기`
                : `${usableCount}건 추가`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
