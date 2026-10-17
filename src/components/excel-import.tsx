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
  isImportTargetField,
  isIlbiseoTemplate,
  loadSavedMapping,
  mappingHasCategory,
  mappingHasTitle,
  parseExcelFile,
  pickDefaultSheetIndex,
  saveMapping,
  sheetToTasks,
  summarizeImportSimilarities,
  type ColumnMapping,
  type ImportField,
  type ParsedSheet,
  type ParsedWorkbook,
} from "@/lib/excel-import";
import { CATEGORY_LABEL, type Task, type TaskCategory } from "@/lib/types";
import { FileSpreadsheet, Loader2 } from "lucide-react";

type Step = "pick" | "sheet" | "map" | "preview";
type ImportMode = "merge" | "replace";

interface ExcelImportProps {
  onImport: (tasks: Task[]) => void;
  onReplaceCategory?: (category: TaskCategory, tasks: Task[]) => void;
  /** Replace by each row's 틀 (Excel 「틀」) — preferred when 틀 column present */
  onReplaceByCategories?: (tasks: Task[]) => void;
  category: TaskCategory;
  /** Active tasks already in the app — for similar-content notice */
  existingTasks?: Task[];
  /** false면 툴바 트리거 없이 open/onOpenChange로만 연다 */
  showTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ExcelImport({
  onImport,
  onReplaceCategory,
  onReplaceByCategories,
  category,
  existingTasks = [],
  showTrigger = true,
  open: openProp,
  onOpenChange,
}: ExcelImportProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
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

  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;

  const sheet: ParsedSheet | null = workbook?.sheets[sheetIndex] ?? null;
  const hasFrameCol = mappingHasCategory(mapping);

  const preview = useMemo(() => {
    if (!sheet) return [];
    return buildPreviewRows(sheet, mapping, category, existingTasks);
  }, [sheet, mapping, category, existingTasks]);

  const usableCount = preview.filter((r) => !r.skip).length;
  const similaritySummary = useMemo(
    () => summarizeImportSimilarities(preview),
    [preview],
  );

  const frameCounts = useMemo(() => {
    const counts = new Map<TaskCategory, number>();
    for (const r of preview) {
      if (r.skip) continue;
      counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [preview]);

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
    if (!controlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
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
    // 시급성은 매핑 UI에 없음 — 들어오면 skip
    const resolved: ImportField =
      field !== "skip" && !isImportTargetField(field) ? "skip" : field;
    setMapping((prev) => {
      const next = { ...prev };
      if (resolved !== "skip") {
        for (const [h, f] of Object.entries(next)) {
          if (f === resolved && h !== header) next[h] = "skip";
        }
      }
      next[header] = resolved;
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
      const canReplace =
        (hasFrameCol && onReplaceByCategories) || onReplaceCategory;
      if (!canReplace) {
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
      if (mode === "replace") {
        if (hasFrameCol && onReplaceByCategories) {
          onReplaceByCategories(tasks);
        } else if (onReplaceCategory) {
          onReplaceCategory(category, tasks);
        }
      } else {
        onImport(tasks);
      }
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기 실패");
    }
  };

  const description = hasFrameCol
    ? "엑셀 「틀」칸대로 업무·개인·과제·팀원에 넣습니다. 「전체」에서도 보입니다."
    : `틀 열이 없으면 「${CATEGORY_LABEL[category]}」에 추가합니다.`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger ? (
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
      ) : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>엑셀 불러오기</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
                            value={
                              mapping[h] === "urgency"
                                ? "skip"
                                : (mapping[h] ?? "skip")
                            }
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

              {hasFrameCol && frameCounts.length > 0 ? (
                <p
                  className="text-[13px] text-[var(--ink-muted)]"
                  data-excel-import-frames
                >
                  틀:{" "}
                  {frameCounts
                    .map(
                      ([cat, n]) => `${CATEGORY_LABEL[cat]} ${n}건`,
                    )
                    .join(" · ")}
                </p>
              ) : (
                <p className="text-[13px] text-[var(--ink-muted)]">
                  → {CATEGORY_LABEL[category]}
                </p>
              )}

              {similaritySummary ? (
                <div
                  className="rounded-sm border border-[#b42318]/35 bg-[#fff8f7] px-2.5 py-2 text-[13px] text-[#7a1f16]"
                  role="status"
                  data-excel-import-similar
                >
                  {similaritySummary.message}
                </div>
              ) : null}

              {usableCount === 0 ? (
                <div className="rounded-sm border border-dashed border-[#9aa5ad] bg-[#f7f8f9] px-3 py-6 text-center text-[14px] text-[var(--ink-muted)]">
                  가져올 행이 없습니다.
                </div>
              ) : (
                <div className="max-h-52 overflow-auto rounded-sm border border-[#9aa5ad]">
                  <table className="w-full min-w-[400px] text-left text-[13px]">
                    <thead className="sticky top-0 bg-[#f3f3f3]">
                      <tr>
                        <th className="border-b border-[#9aa5ad] px-2 py-1">
                          할 일
                        </th>
                        {hasFrameCol ? (
                          <th className="border-b border-[#9aa5ad] px-2 py-1">
                            틀
                          </th>
                        ) : null}
                        <th className="border-b border-[#9aa5ad] px-2 py-1">
                          마감
                        </th>
                        <th className="border-b border-[#9aa5ad] px-2 py-1">
                          중요
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
                            data-excel-import-similar-row={
                              r.similarHits.length > 0 ? "1" : undefined
                            }
                          >
                            <td className="max-w-[10rem] truncate px-2 py-1">
                              {r.title}
                              {r.similarHits.length > 0 ? (
                                <span className="ml-1 text-[11px] text-[#b42318]">
                                  (비슷함)
                                </span>
                              ) : null}
                            </td>
                            {hasFrameCol ? (
                              <td className="whitespace-nowrap px-2 py-1">
                                {r.categoryLabel}
                              </td>
                            ) : null}
                            <td className="whitespace-nowrap px-2 py-1">
                              {r.deadlineLabel}
                            </td>
                            <td className="px-2 py-1">{r.importance}</td>
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
                    <span>
                      {hasFrameCol
                        ? "엑셀에 있는 틀만 이 목록으로 바꾸기"
                        : "현재 틀을 이 목록으로 바꾸기"}
                    </span>
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
              data-excel-import-commit
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
