"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  /** 현재 틀 할 일을 가져온 목록으로 바꿀 때 (명시 확인 후) */
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
  const [info, setInfo] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mode, setMode] = useState<ImportMode>("merge");
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sheet: ParsedSheet | null = workbook?.sheets[sheetIndex] ?? null;

  const preview = useMemo(() => {
    if (!sheet) return [];
    return buildPreviewRows(sheet, mapping, category);
  }, [sheet, mapping, category]);

  const usableCount = preview.filter((r) => !r.skip).length;
  const skippedCount = preview.length - usableCount;

  const reset = () => {
    setStep("pick");
    setBusy(false);
    setError(null);
    setInfo(null);
    setWorkbook(null);
    setSheetIndex(0);
    setMapping({});
    setMode("merge");
    setReplaceConfirm(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const goAfterSheet = (wb: ParsedWorkbook, idx: number) => {
    const s = wb.sheets[idx];
    if (!s) {
      setError("시트를 찾을 수 없습니다.");
      return;
    }
    const saved = loadSavedMapping();
    const nextMap = applySavedOrAuto(s.headers, saved);
    setMapping(nextMap);
    if (isIlbiseoTemplate(s.headers) && mappingHasTitle(nextMap)) {
      setInfo("일비서 양식과 열이 같아서 바로 미리보기로 갑니다.");
      setStep("preview");
    } else {
      setInfo(
        saved
          ? "이전에 맞춘 열 매핑을 불러왔습니다. 확인 후 다음으로 가세요."
          : "아빠 엑셀 열을 우리 칸에 맞춰 주세요.",
      );
      setStep("map");
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const wb = await parseExcelFile(file);
      setWorkbook(wb);
      const idx = pickDefaultSheetIndex(wb.sheets);
      setSheetIndex(idx);
      if (wb.sheets.length > 1) {
        setInfo(
          `파일에 시트가 ${wb.sheets.length}개 있습니다. 가져올 시트를 고르세요.`,
        );
        setStep("sheet");
      } else {
        goAfterSheet(wb, idx);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "파일을 읽지 못했습니다.",
      );
      setStep("pick");
    } finally {
      setBusy(false);
    }
  };

  const setFieldMapping = (header: string, field: ImportField) => {
    setMapping((prev) => {
      const next = { ...prev };
      // one field → one column
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
      setError("「할 일」칸에 맞는 열을 하나 지정해 주세요.");
      return;
    }
    if (usableCount === 0) {
      setError("가져올 할 일이 없습니다. 열 매핑을 확인해 주세요.");
      return;
    }
    if (mode === "replace") {
      if (!replaceConfirm) {
        setError(
          "바꾸기를 쓰려면 아래 「정말 바꿀게요」를 체크해 주세요.",
        );
        return;
      }
      if (!onReplaceCategory) {
        setError("현재 틀 바꾸기는 이 화면에서 쓸 수 없습니다.");
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
      setError(e instanceof Error ? e.message : "가져오기에 실패했습니다.");
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
            className="h-9 rounded-sm border-[#8a939a] bg-white"
            data-excel-import
          >
            <FileSpreadsheet className="size-3.5" />
            엑셀 불러오기
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>엑셀 불러오기</DialogTitle>
          <DialogDescription>
            아빠 엑셀·CSV를 현재 틀에 넣습니다. 기본은{" "}
            <strong className="font-semibold text-[var(--ink)]">
              기존 할 일에 추가
            </strong>
            입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === "pick" ? (
            <div className="space-y-3">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                className="h-11 w-full touch-manipulation text-[15px] sm:w-auto"
                onClick={() => inputRef.current?.click()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="size-4" />
                )}
                {busy ? "읽는 중…" : "파일 선택 (.xlsx · .xls · .csv)"}
              </Button>
              <p className="text-[14px] leading-relaxed text-[var(--ink-muted)]">
                일비서에서 보낸 양식이면 열이 자동으로 맞춰집니다. 다른
                양식이면 열 이름을 한 번만 맞춰 두면 다음에도 기억합니다.
              </p>
            </div>
          ) : null}

          {step === "sheet" && workbook ? (
            <div className="space-y-3">
              <Label htmlFor="excel-sheet">가져올 시트</Label>
              <select
                id="excel-sheet"
                value={sheetIndex}
                onChange={(e) => setSheetIndex(Number(e.target.value))}
                className="h-11 w-full rounded-sm border border-[#8a939a] bg-white px-2.5 text-[15px]"
              >
                {workbook.sheets.map((s, i) => (
                  <option key={`${s.name}-${i}`} value={i}>
                    {s.name} ({s.rows.length}행)
                  </option>
                ))}
              </select>
              <Button
                type="button"
                className="h-11 touch-manipulation"
                onClick={() => {
                  if (workbook) goAfterSheet(workbook, sheetIndex);
                }}
              >
                이 시트로 계속
              </Button>
            </div>
          ) : null}

          {step === "map" && sheet ? (
            <div className="space-y-3">
              <p className="text-[14px] text-[var(--ink)]">
                <span className="font-semibold">{workbook?.fileName}</span>
                {" · "}
                시트 「{sheet.name}」
              </p>
              <div className="overflow-x-auto rounded-sm border border-[#9aa5ad]">
                <table className="w-full min-w-[320px] text-left text-[14px]">
                  <thead className="bg-[#f3f3f3]">
                    <tr>
                      <th className="border-b border-[#9aa5ad] px-2 py-2 font-semibold">
                        아빠 열
                      </th>
                      <th className="border-b border-[#9aa5ad] px-2 py-2 font-semibold">
                        우리 칸
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.headers.map((h) => (
                      <tr key={h} className="border-b border-[#d0d5d9]">
                        <td className="px-2 py-2 align-middle">{h}</td>
                        <td className="px-2 py-2">
                          <select
                            value={mapping[h] ?? "skip"}
                            onChange={(e) =>
                              setFieldMapping(
                                h,
                                e.target.value as ImportField,
                              )
                            }
                            className="h-10 w-full min-w-[8rem] rounded-sm border border-[#8a939a] bg-white px-2 text-[14px]"
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
                <p className="text-[14px] text-destructive">
                  「할 일」에 해당하는 열을 하나 골라 주세요.
                </p>
              ) : null}
              <Button
                type="button"
                className="h-11 touch-manipulation"
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
            <div className="space-y-3">
              <p className="text-[14px] text-[var(--ink)]">
                <span className="font-semibold">{usableCount}건</span>을
                가져옵니다
                {skippedCount > 0
                  ? ` (빈 제목 ${skippedCount}건은 건너뜀)`
                  : ""}
                .
              </p>

              {usableCount === 0 ? (
                <div className="rounded-sm border border-dashed border-[#9aa5ad] bg-[#f7f8f9] px-4 py-8 text-center text-[15px] text-[var(--ink-muted)]">
                  가져올 행이 없습니다. 열 매핑을 다시 확인해 주세요.
                </div>
              ) : (
                <div className="max-h-56 overflow-auto rounded-sm border border-[#9aa5ad]">
                  <table className="w-full min-w-[480px] text-left text-[13px]">
                    <thead className="sticky top-0 bg-[#f3f3f3]">
                      <tr>
                        <th className="border-b border-[#9aa5ad] px-2 py-1.5">
                          할 일
                        </th>
                        <th className="border-b border-[#9aa5ad] px-2 py-1.5">
                          마감
                        </th>
                        <th className="border-b border-[#9aa5ad] px-2 py-1.5">
                          중요
                        </th>
                        <th className="border-b border-[#9aa5ad] px-2 py-1.5">
                          시급
                        </th>
                        <th className="border-b border-[#9aa5ad] px-2 py-1.5">
                          완료
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview
                        .filter((r) => !r.skip)
                        .slice(0, 40)
                        .map((r, i) => (
                          <tr
                            key={`${r.title}-${i}`}
                            className="border-b border-[#e0e4e7]"
                          >
                            <td className="max-w-[14rem] truncate px-2 py-1.5">
                              {r.title}
                              {r.memo ? (
                                <span className="block truncate text-[12px] text-[var(--ink-muted)]">
                                  {r.memo}
                                </span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5">
                              {r.deadlineLabel}
                            </td>
                            <td className="px-2 py-1.5">{r.importance}</td>
                            <td className="px-2 py-1.5">{r.urgency}</td>
                            <td className="px-2 py-1.5">
                              {r.done ? "완료" : ""}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {usableCount > 40 ? (
                    <p className="px-2 py-1 text-[12px] text-[var(--ink-muted)]">
                      …외 {usableCount - 40}건
                    </p>
                  ) : null}
                </div>
              )}

              <fieldset className="space-y-2 rounded-sm border border-[#9aa5ad] bg-[#f7f8f9] px-3 py-3">
                <legend className="px-1 text-[14px] font-semibold">
                  넣는 방식
                </legend>
                <label className="flex cursor-pointer items-start gap-2 text-[14px]">
                  <input
                    type="radio"
                    name="excel-import-mode"
                    className="mt-1"
                    checked={mode === "merge"}
                    onChange={() => {
                      setMode("merge");
                      setReplaceConfirm(false);
                      setError(null);
                    }}
                  />
                  <span>
                    <span className="font-medium">기존 할 일에 추가</span>
                    <span className="block text-[13px] text-[var(--ink-muted)]">
                      지금 목록은 그대로 두고 뒤에 붙입니다. (권장)
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-[14px]">
                  <input
                    type="radio"
                    name="excel-import-mode"
                    className="mt-1"
                    checked={mode === "replace"}
                    onChange={() => {
                      setMode("replace");
                      setReplaceConfirm(false);
                      setError(null);
                    }}
                  />
                  <span>
                    <span className="font-medium">
                      현재 틀 할 일을 이 목록으로 바꾸기
                    </span>
                    <span className="block text-[13px] text-[var(--ink-muted)]">
                      이 틀에 있던 할 일·한 일은 지워집니다. 조심해서
                      쓰세요.
                    </span>
                  </span>
                </label>
                {mode === "replace" ? (
                  <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-sm border border-[#b42318]/35 bg-white px-2 py-2 text-[14px] text-[#b42318]">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={replaceConfirm}
                      onChange={(e) => {
                        setReplaceConfirm(e.target.checked);
                        setError(null);
                      }}
                    />
                    <span>
                      정말 바꿀게요. 현재 틀의 기존 항목을 지워도 됩니다.
                    </span>
                  </label>
                ) : null}
              </fieldset>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 touch-manipulation"
                  onClick={() => {
                    setError(null);
                    setStep(
                      isIlbiseoTemplate(sheet.headers) ? "pick" : "map",
                    );
                  }}
                >
                  {isIlbiseoTemplate(sheet.headers)
                    ? "파일 다시 고르기"
                    : "열 매핑으로"}
                </Button>
              </div>
            </div>
          ) : null}

          {info ? (
            <p className="text-[14px] text-[var(--ink-muted)]">{info}</p>
          ) : null}
          {error ? (
            <p className="text-[14px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
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
                : `${usableCount}건 추가하기`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
