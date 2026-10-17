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
  buildSidePreviewRows,
  classifyImportSheet,
  IMPORT_FIELD_LABEL,
  IMPORT_TARGET_FIELDS,
  isImportTargetField,
  isIlbiseoTemplate,
  loadSavedMapping,
  mappingHasCategory,
  mappingHasTitle,
  parseExcelFile,
  pickDefaultSheetIndex,
  previewToReplaceSideItems,
  previewToReplaceTasks,
  previewToSideDelta,
  previewToTodoDelta,
  saveMapping,
  sideKindFromSheet,
  summarizeDeltaCounts,
  summarizeExactBlocks,
  summarizeImportSimilarities,
  type ColumnMapping,
  type ImportField,
  type ImportSheetKind,
  type ParsedSheet,
  type ParsedWorkbook,
  type SideDeltaCommit,
  type TodoDeltaCommit,
} from "@/lib/excel-import";
import {
  CATEGORY_LABEL,
  type SideListItem,
  type SideListKind,
  type Task,
  type TaskCategory,
} from "@/lib/types";
import { FileSpreadsheet, Loader2 } from "lucide-react";

type Step = "pick" | "sheet" | "map" | "preview";
type ImportMode = "merge" | "replace";

const SELECT_CLASS =
  "h-11 w-full rounded-sm border border-[#8a939a] bg-white px-2.5 text-[15px] text-[#1a1f1c] dark:border-[#4a5c52] dark:bg-[#1c2621] dark:text-[#e8eee9]";

const DELTA_LABEL: Record<string, string> = {
  new: "새",
  changed: "바뀜",
  unchanged: "그대로",
  exact_block: "같은 내용",
};

interface ExcelImportProps {
  /** Fallback when delta callback missing (memo/OCR-style add-only). */
  onImport: (tasks: Task[]) => void;
  onReplaceCategory?: (category: TaskCategory, tasks: Task[]) => void;
  onReplaceByCategories?: (tasks: Task[]) => void;
  /** Preferred: only new + changed vs in-app data. */
  onTodoDelta?: (payload: TodoDeltaCommit) => void;
  onImportSide?: (kind: SideListKind, items: SideListItem[]) => void;
  onReplaceSide?: (kind: SideListKind, items: SideListItem[]) => void;
  onSideDelta?: (kind: SideListKind, payload: SideDeltaCommit) => void;
  category: TaskCategory;
  existingTasks?: Task[];
  existingGuidelines?: SideListItem[];
  existingHabits?: SideListItem[];
  showTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ExcelImport({
  onImport,
  onReplaceCategory,
  onReplaceByCategories,
  onTodoDelta,
  onImportSide,
  onReplaceSide,
  onSideDelta,
  category,
  existingTasks = [],
  existingGuidelines = [],
  existingHabits = [],
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
  const sheetKind: ImportSheetKind =
    (sheet && classifyImportSheet(sheet.name)) || "todo";
  const isSide = sheetKind !== "todo";
  const hasFrameCol = !isSide && mappingHasCategory(mapping);

  const sideExisting =
    sheetKind === "guideline"
      ? existingGuidelines
      : sheetKind === "habit"
        ? existingHabits
        : [];

  const preview = useMemo(() => {
    if (!sheet) return [];
    if (isSide) return buildSidePreviewRows(sheet, mapping, sideExisting);
    return buildPreviewRows(sheet, mapping, category, existingTasks);
  }, [sheet, mapping, category, existingTasks, isSide, sideExisting]);

  const deltaSummary = useMemo(
    () => summarizeDeltaCounts(preview),
    [preview],
  );
  const applyCount =
    mode === "replace"
      ? preview.filter((r) => r.delta !== "empty").length
      : deltaSummary.neu + deltaSummary.changed;
  const blockedExact = deltaSummary.blocked;
  const similaritySummary = useMemo(
    () => summarizeImportSimilarities(preview),
    [preview],
  );
  const exactSummary = useMemo(
    () => summarizeExactBlocks(preview),
    [preview],
  );

  const frameCounts = useMemo(() => {
    if (isSide) return [];
    const counts = new Map<TaskCategory, number>();
    for (const r of preview) {
      if (mode === "replace") {
        if (r.delta === "empty") continue;
      } else if (r.delta !== "new" && r.delta !== "changed") {
        continue;
      }
      counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [preview, isSide, mode]);

  const previewRows = useMemo(() => {
    if (mode === "replace") {
      return preview.filter((r) => r.delta !== "empty");
    }
    // Father preview: show new/changed/unchanged/blocked (not empty)
    return preview.filter((r) => r.delta !== "empty");
  }, [preview, mode]);

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
    const kind = classifyImportSheet(s.name) ?? "todo";
    const saved = kind === "todo" ? loadSavedMapping() : null;
    const nextMap = applySavedOrAuto(s.headers, saved, kind);
    setMapping(nextMap);
    if (kind !== "todo") {
      setStep(mappingHasTitle(nextMap) ? "preview" : "map");
      return;
    }
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
      setError("「할 일」또는 「내용」열을 지정해 주세요.");
      return;
    }
    if (applyCount === 0) {
      setError(
        blockedExact > 0 || deltaSummary.unchanged > 0
          ? "바꿀 내용이 없습니다. (그대로이거나 같은 내용만 있음)"
          : "가져올 행이 없습니다.",
      );
      return;
    }
    if (mode === "replace" && !replaceConfirm) {
      setError("바꾸려면 「정말 바꿀게요」를 체크해 주세요.");
      return;
    }

    try {
      if (isSide) {
        const sideKind = sideKindFromSheet(sheetKind);
        if (!sideKind) {
          setError("시트 종류를 알 수 없습니다.");
          return;
        }
        if (mode === "replace") {
          if (!onReplaceSide) {
            setError("바꾸기를 쓸 수 없습니다.");
            return;
          }
          const items = previewToReplaceSideItems(preview);
          if (items.length === 0) {
            setError("가져올 행이 없습니다.");
            return;
          }
          onReplaceSide(sideKind, items);
        } else {
          const delta = previewToSideDelta(preview);
          if (delta.add.length === 0 && delta.update.length === 0) {
            setError("바꿀 내용이 없습니다.");
            return;
          }
          if (onSideDelta) {
            onSideDelta(sideKind, delta);
          } else if (onImportSide) {
            // Fallback: add-only (changed rows skipped)
            if (delta.add.length === 0) {
              setError("지침·습관 변경 반영을 쓸 수 없습니다.");
              return;
            }
            onImportSide(sideKind, delta.add);
          } else {
            setError("지침·습관 가져오기를 쓸 수 없습니다.");
            return;
          }
        }
        handleOpenChange(false);
        return;
      }

      saveMapping(mapping);
      if (mode === "replace") {
        const tasks = previewToReplaceTasks(preview);
        if (tasks.length === 0) {
          setError("가져올 할 일이 없습니다.");
          return;
        }
        if (hasFrameCol && onReplaceByCategories) {
          onReplaceByCategories(tasks);
        } else if (onReplaceCategory) {
          onReplaceCategory(category, tasks);
        } else {
          setError("바꾸기를 쓸 수 없습니다.");
          return;
        }
      } else {
        const delta = previewToTodoDelta(preview);
        if (delta.add.length === 0 && delta.update.length === 0) {
          setError("바꿀 내용이 없습니다.");
          return;
        }
        if (onTodoDelta) {
          onTodoDelta(delta);
        } else {
          // Fallback: add-only
          if (delta.add.length === 0) {
            setError("변경 반영을 쓸 수 없습니다. (새 행만 추가 가능)");
            return;
          }
          onImport(delta.add);
        }
      }
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기 실패");
    }
  };

  const sheetLabel =
    sheetKind === "guideline"
      ? "지침"
      : sheetKind === "habit"
        ? "습관"
        : "할 일";

  const commitLabel =
    mode === "replace"
      ? `${applyCount}건으로 바꾸기`
      : deltaSummary.changed > 0 && deltaSummary.neu > 0
        ? `새 ${deltaSummary.neu} · 바뀐 ${deltaSummary.changed} 반영`
        : deltaSummary.changed > 0
          ? `바뀐 ${deltaSummary.changed}건 반영`
          : `새 ${deltaSummary.neu}건 추가`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger ? (
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 min-h-11 touch-manipulation rounded-sm border-[#8a939a] bg-white px-3 sm:h-9 sm:min-h-9 dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8eee9]"
              data-excel-import
            >
              <FileSpreadsheet className="size-3.5" />
              엑셀 불러오기
            </Button>
          }
        />
      ) : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:border-[#3d4a44] dark:bg-[#15201b]">
        <DialogHeader>
          <DialogTitle>엑셀 불러오기</DialogTitle>
          <DialogDescription>
            프로그램 값이 기본입니다. 엑셀에서 새로 넣거나 바꾼 행만 가져옵니다.
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
            <div className="space-y-2" data-excel-import-sheet-pick>
              <p className="text-[14px] text-[var(--ink)]">시트 선택</p>
              <select
                value={sheetIndex}
                onChange={(e) => setSheetIndex(Number(e.target.value))}
                className={SELECT_CLASS}
                aria-label="가져올 시트"
                data-excel-import-sheet-select
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
                아빠 열 → 우리 칸
              </p>
              <div className="overflow-x-auto rounded-sm border border-[#9aa5ad] dark:border-[#4a5c52]">
                <table className="w-full min-w-[280px] text-left text-[14px]">
                  <thead className="bg-[#f3f3f3] dark:bg-[#24302a]">
                    <tr>
                      <th className="border-b border-[#9aa5ad] px-2 py-1.5 font-semibold dark:border-[#4a5c52]">
                        아빠 열
                      </th>
                      <th className="border-b border-[#9aa5ad] px-2 py-1.5 font-semibold dark:border-[#4a5c52]">
                        우리 칸
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.headers.map((h) => (
                      <tr
                        key={h}
                        className="border-b border-[#d0d5d9] dark:border-[#3d4a44]"
                      >
                        <td className="px-2 py-1.5 align-middle">{h}</td>
                        <td className="px-2 py-1.5">
                          <select
                            value={
                              mapping[h] === "urgency" || mapping[h] === "done"
                                ? "skip"
                                : (mapping[h] ?? "skip")
                            }
                            onChange={(e) =>
                              setFieldMapping(
                                h,
                                e.target.value as ImportField,
                              )
                            }
                            className={`${SELECT_CLASS} h-9 min-w-[7.5rem] text-[14px]`}
                            aria-label={`${h} 매핑`}
                          >
                            <option value="skip">
                              {IMPORT_FIELD_LABEL.skip}
                            </option>
                            {IMPORT_TARGET_FIELDS.filter((f) => {
                              // 지침/습관·할 일 모두 완료여부 매핑 UI 숨김
                              if (f === "done") return false;
                              if (isSide) {
                                return f === "title" || f === "memo";
                              }
                              return true;
                            }).map((f) => (
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
            <div className="space-y-2" data-excel-import-preview>
              <p
                className="text-[14px] font-medium text-[var(--ink)]"
                data-excel-import-delta-summary
              >
                {sheetLabel} · {deltaSummary.message}
              </p>

              {hasFrameCol && frameCounts.length > 0 ? (
                <p
                  className="text-[13px] text-[var(--ink-muted)]"
                  data-excel-import-frames
                >
                  틀:{" "}
                  {frameCounts
                    .map(([cat, n]) => `${CATEGORY_LABEL[cat]} ${n}건`)
                    .join(" · ")}
                </p>
              ) : null}

              {exactSummary ? (
                <div
                  className="rounded-sm border border-[#8a939a]/40 bg-[#f0f2f1] px-2.5 py-2 text-[13px] text-[var(--ink-muted)] dark:border-[#4a5c52] dark:bg-[#24302a]"
                  role="status"
                  data-excel-import-exact
                >
                  {exactSummary.message}
                </div>
              ) : null}

              {similaritySummary ? (
                <div
                  className="rounded-sm border border-[#b42318]/35 bg-[#fff8f7] px-2.5 py-2 text-[13px] text-[#7a1f16] dark:border-[#c45c52]/50 dark:bg-[#2a1a18] dark:text-[#f0c4be]"
                  role="status"
                  data-excel-import-similar
                >
                  {similaritySummary.message}
                </div>
              ) : null}

              {previewRows.length === 0 ? (
                <div className="rounded-sm border border-dashed border-[#9aa5ad] bg-[#f7f8f9] px-3 py-6 text-center text-[14px] text-[var(--ink-muted)] dark:border-[#4a5c52] dark:bg-[#1c2621]">
                  가져올 행이 없습니다.
                </div>
              ) : (
                <div className="max-h-52 overflow-auto rounded-sm border border-[#9aa5ad] dark:border-[#4a5c52]">
                  <table className="w-full min-w-[320px] text-left text-[13px]">
                    <thead className="sticky top-0 bg-[#f3f3f3] dark:bg-[#24302a]">
                      <tr>
                        <th className="border-b border-[#9aa5ad] px-2 py-1 dark:border-[#4a5c52]">
                          구분
                        </th>
                        <th className="border-b border-[#9aa5ad] px-2 py-1 dark:border-[#4a5c52]">
                          {isSide ? "내용" : "할 일"}
                        </th>
                        {hasFrameCol ? (
                          <th className="border-b border-[#9aa5ad] px-2 py-1 dark:border-[#4a5c52]">
                            틀
                          </th>
                        ) : null}
                        {!isSide ? (
                          <th className="border-b border-[#9aa5ad] px-2 py-1 dark:border-[#4a5c52]">
                            마감
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 40).map((r, i) => (
                        <tr
                          key={`${r.title}-${r.delta}-${i}`}
                          className="border-b border-[#e0e4e7] dark:border-[#3d4a44]"
                          data-excel-import-delta={r.delta}
                          data-excel-import-similar-row={
                            r.similarHits.length > 0 ? "1" : undefined
                          }
                        >
                          <td className="whitespace-nowrap px-2 py-1">
                            <span
                              className={
                                r.delta === "new"
                                  ? "text-[#217346] dark:text-[#6dba8f]"
                                  : r.delta === "changed"
                                    ? "text-[#3b6ea5] dark:text-[#8eb4dc]"
                                    : "text-[var(--ink-muted)]"
                              }
                            >
                              {DELTA_LABEL[r.delta] ?? r.delta}
                            </span>
                          </td>
                          <td className="max-w-[11rem] truncate px-2 py-1">
                            {r.title}
                            {r.similarHits.length > 0 ? (
                              <span className="ml-1 text-[11px] text-[#b42318] dark:text-[#f0a8a0]">
                                (비슷함)
                              </span>
                            ) : null}
                          </td>
                          {hasFrameCol ? (
                            <td className="whitespace-nowrap px-2 py-1">
                              {r.categoryLabel}
                            </td>
                          ) : null}
                          {!isSide ? (
                            <td
                              className="whitespace-nowrap px-2 py-1"
                              data-excel-import-deadline
                            >
                              {r.deadlineLabel}
                            </td>
                          ) : null}
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
                <div className="space-y-2 rounded-sm border border-[#b42318]/30 bg-[#fff8f7] px-2.5 py-2 dark:border-[#c45c52]/40 dark:bg-[#2a1a18]">
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
                    <span>새·바뀐 행만 반영 (기본)</span>
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
                      {isSide
                        ? `${sheetLabel}을 이 목록으로 바꾸기`
                        : hasFrameCol
                          ? "엑셀에 있는 틀만 바꾸기"
                          : "현재 틀을 바꾸기"}
                    </span>
                  </label>
                  {mode === "replace" ? (
                    <label className="flex cursor-pointer items-start gap-2 text-[13px] text-[#b42318] dark:text-[#f0a8a0]">
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
                  reset();
                  setStep("pick");
                }}
              >
                다른 파일
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
            className="h-11 touch-manipulation dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8eee9]"
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          {step === "preview" ? (
            <Button
              type="button"
              className="h-11 touch-manipulation bg-[#217346] text-white hover:bg-[#1a5c38]"
              disabled={applyCount === 0 || busy}
              onClick={handleCommit}
              data-excel-import-commit
            >
              {commitLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
