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
  buildWorkbookImportPlan,
  IMPORT_FIELD_LABEL,
  IMPORT_TARGET_FIELDS,
  isImportTargetField,
  isIlbiseoTemplate,
  loadSavedMapping,
  mappingHasCategory,
  mappingHasTitle,
  parseExcelFile,
  planToWorkbookDelta,
  previewToReplaceSideItems,
  previewToReplaceTasks,
  saveMapping,
  summarizeExactBlocks,
  summarizeImportSimilarities,
  workbookDeltaApplyCount,
  type ColumnMapping,
  type ImportField,
  type MappedPreviewRow,
  type ParsedWorkbook,
  type SheetImportSlice,
  type SideDeltaCommit,
  type TodoDeltaCommit,
  type WorkbookImportPlan,
} from "@/lib/excel-import";
import {
  CATEGORY_LABEL,
  type SideListItem,
  type SideListKind,
  type Task,
  type TaskCategory,
} from "@/lib/types";
import { FileSpreadsheet, Loader2 } from "lucide-react";

type Step = "pick" | "map" | "preview";
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
  const [todoMapping, setTodoMapping] = useState<ColumnMapping>({});
  const [mode, setMode] = useState<ImportMode>("merge");
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;

  const plan: WorkbookImportPlan | null = useMemo(() => {
    if (!workbook) return null;
    return buildWorkbookImportPlan(workbook, {
      defaultCategory: category,
      existingTasks,
      existingGuidelines,
      existingHabits,
      todoMapping:
        Object.keys(todoMapping).length > 0 ? todoMapping : null,
    });
  }, [
    workbook,
    category,
    existingTasks,
    existingGuidelines,
    existingHabits,
    todoMapping,
  ]);

  const deltaCommit = useMemo(
    () => (plan ? planToWorkbookDelta(plan) : null),
    [plan],
  );
  const applyCount = deltaCommit ? workbookDeltaApplyCount(deltaCommit) : 0;
  const hasFrameCol = Boolean(
    plan?.todo && mappingHasCategory(plan.todo.mapping),
  );

  const allSimilar = useMemo(() => {
    if (!plan) return null;
    const merged: MappedPreviewRow[] = [];
    for (const s of [plan.todo, plan.guideline, plan.habit]) {
      if (s) merged.push(...s.preview);
    }
    return summarizeImportSimilarities(merged);
  }, [plan]);

  const allExact = useMemo(() => {
    if (!plan) return null;
    const merged: MappedPreviewRow[] = [];
    for (const s of [plan.todo, plan.guideline, plan.habit]) {
      if (s) merged.push(...s.preview);
    }
    return summarizeExactBlocks(merged);
  }, [plan]);

  const reset = () => {
    setStep("pick");
    setBusy(false);
    setError(null);
    setWorkbook(null);
    setTodoMapping({});
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

  const goPreviewOrMap = (wb: ParsedWorkbook) => {
    const todoSheet =
      wb.sheets.find((s) => {
        const n = s.name.replace(/\s+/g, " ").trim();
        return n === "할 일" || n === "할일";
      }) ?? null;
    if (!todoSheet) {
      // Only side sheets — skip map
      setTodoMapping({});
      setStep("preview");
      return;
    }
    const saved = loadSavedMapping();
    const nextMap = applySavedOrAuto(todoSheet.headers, saved, "todo");
    setTodoMapping(nextMap);
    if (isIlbiseoTemplate(todoSheet.headers) && mappingHasTitle(nextMap)) {
      setStep("preview");
    } else if (!mappingHasTitle(nextMap)) {
      setStep("map");
    } else {
      setStep("preview");
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const wb = await parseExcelFile(file);
      setWorkbook(wb);
      // Fixed three sheets — no sheet picker
      goPreviewOrMap(wb);
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
    setTodoMapping((prev) => {
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
    if (!plan || !deltaCommit) return;
    if (plan.todo && !mappingHasTitle(plan.todo.mapping)) {
      setError("「할 일」열을 지정해 주세요.");
      return;
    }
    if (mode === "merge" && applyCount === 0) {
      setError(
        plan.combined.unchanged > 0 || plan.combined.blocked > 0
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
      if (mode === "replace") {
        // Replace each present sheet independently
        if (plan.todo) {
          const tasks = previewToReplaceTasks(plan.todo.preview);
          if (tasks.length > 0) {
            saveMapping(plan.todo.mapping);
            if (hasFrameCol && onReplaceByCategories) {
              onReplaceByCategories(tasks);
            } else if (onReplaceCategory) {
              onReplaceCategory(category, tasks);
            } else {
              setError("바꾸기를 쓸 수 없습니다.");
              return;
            }
          }
        }
        if (plan.guideline) {
          if (!onReplaceSide) {
            setError("지침 바꾸기를 쓸 수 없습니다.");
            return;
          }
          const items = previewToReplaceSideItems(plan.guideline.preview);
          onReplaceSide("guideline", items);
        }
        if (plan.habit) {
          if (!onReplaceSide) {
            setError("습관 바꾸기를 쓸 수 없습니다.");
            return;
          }
          const items = previewToReplaceSideItems(plan.habit.preview);
          onReplaceSide("habit", items);
        }
        handleOpenChange(false);
        return;
      }

      // Delta merge — all three in one confirm
      if (plan.todo) saveMapping(plan.todo.mapping);

      const { todo, guideline, habit } = deltaCommit;
      let did = false;

      if (todo.add.length > 0 || todo.update.length > 0) {
        if (onTodoDelta) {
          onTodoDelta(todo);
          did = true;
        } else if (todo.add.length > 0) {
          onImport(todo.add);
          did = true;
        } else {
          setError("할 일 변경 반영을 쓸 수 없습니다.");
          return;
        }
      }

      const applySide = (
        kind: SideListKind,
        payload: SideDeltaCommit,
      ): boolean => {
        if (payload.add.length === 0 && payload.update.length === 0) {
          return true;
        }
        if (onSideDelta) {
          onSideDelta(kind, payload);
          return true;
        }
        if (onImportSide && payload.add.length > 0) {
          onImportSide(kind, payload.add);
          return true;
        }
        return false;
      };

      if (guideline.add.length > 0 || guideline.update.length > 0) {
        if (!applySide("guideline", guideline)) {
          setError("지침 가져오기를 쓸 수 없습니다.");
          return;
        }
        did = true;
      }
      if (habit.add.length > 0 || habit.update.length > 0) {
        if (!applySide("habit", habit)) {
          setError("습관 가져오기를 쓸 수 없습니다.");
          return;
        }
        did = true;
      }

      if (!did) {
        setError("바꿀 내용이 없습니다.");
        return;
      }
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기 실패");
    }
  };

  const commitLabel =
    mode === "replace"
      ? "목록 바꾸기"
      : plan && plan.combined.neu + plan.combined.changed > 0
        ? `새 ${plan.combined.neu} · 바뀐 ${plan.combined.changed} 반영`
        : "반영";

  const todoSheetForMap = workbook
    ? workbook.sheets.find((s) => {
        const n = s.name.replace(/\s+/g, " ").trim();
        return n === "할 일" || n === "할일";
      })
    : null;

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
            「할 일」·「지침」·「습관」을 한 번에 가져옵니다. 프로그램 값이
            기본이며, 새로 넣거나 바꾼 행만 반영합니다.
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

          {step === "map" && todoSheetForMap ? (
            <div className="space-y-2">
              <p className="text-[13px] text-[var(--ink-muted)]">
                「할 일」시트 · 아빠 열 → 우리 칸
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
                    {todoSheetForMap.headers.map((h) => (
                      <tr
                        key={h}
                        className="border-b border-[#d0d5d9] dark:border-[#3d4a44]"
                      >
                        <td className="px-2 py-1.5 align-middle">{h}</td>
                        <td className="px-2 py-1.5">
                          <select
                            value={
                              todoMapping[h] === "urgency" ||
                              todoMapping[h] === "done"
                                ? "skip"
                                : (todoMapping[h] ?? "skip")
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
                            {IMPORT_TARGET_FIELDS.filter(
                              (f) => f !== "done",
                            ).map((f) => (
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
                disabled={!mappingHasTitle(todoMapping)}
                onClick={() => {
                  setError(null);
                  setStep("preview");
                }}
              >
                미리보기
              </Button>
            </div>
          ) : null}

          {step === "preview" && plan ? (
            <div className="space-y-3" data-excel-import-preview>
              <p
                className="text-[14px] font-medium text-[var(--ink)]"
                data-excel-import-delta-summary
              >
                {plan.presentLabels.length > 0
                  ? `${plan.presentLabels.join(" · ")} · ${plan.combined.message}`
                  : "가져올 시트가 없습니다"}
              </p>

              {allExact ? (
                <div
                  className="rounded-sm border border-[#8a939a]/40 bg-[#f0f2f1] px-2.5 py-2 text-[13px] text-[var(--ink-muted)] dark:border-[#4a5c52] dark:bg-[#24302a]"
                  role="status"
                  data-excel-import-exact
                >
                  {allExact.message}
                </div>
              ) : null}

              {allSimilar ? (
                <div
                  className="rounded-sm border border-[#b42318]/35 bg-[#fff8f7] px-2.5 py-2 text-[13px] text-[#7a1f16] dark:border-[#c45c52]/50 dark:bg-[#2a1a18] dark:text-[#f0c4be]"
                  role="status"
                  data-excel-import-similar
                >
                  {allSimilar.message}
                </div>
              ) : null}

              {([plan.todo, plan.guideline, plan.habit] as const).map(
                (slice) =>
                  slice ? (
                    <SheetPreviewBlock
                      key={slice.kind}
                      slice={slice}
                      showFrame={slice.kind === "todo" && hasFrameCol}
                      showDeadline={slice.kind === "todo"}
                    />
                  ) : null,
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
                    <span>있는 시트를 이 목록으로 바꾸기</span>
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
              disabled={
                (mode === "merge" && applyCount === 0) ||
                busy ||
                !plan ||
                plan.presentLabels.length === 0
              }
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

function SheetPreviewBlock({
  slice,
  showFrame,
  showDeadline,
}: {
  slice: SheetImportSlice;
  showFrame: boolean;
  showDeadline: boolean;
}) {
  const rows = slice.preview.filter((r) => r.delta !== "empty").slice(0, 20);
  return (
    <div
      className="space-y-1.5"
      data-excel-import-sheet={slice.kind}
    >
      <p className="text-[13px] font-medium text-[var(--ink)]">
        {slice.label} · {slice.summary.message}
      </p>
      {showFrame ? (
        <FrameLine preview={slice.preview} />
      ) : null}
      {rows.length === 0 ? (
        <p className="text-[12px] text-[var(--ink-muted)]">행 없음</p>
      ) : (
        <div className="max-h-36 overflow-auto rounded-sm border border-[#9aa5ad] dark:border-[#4a5c52]">
          <table className="w-full min-w-[280px] text-left text-[13px]">
            <thead className="sticky top-0 bg-[#f3f3f3] dark:bg-[#24302a]">
              <tr>
                <th className="border-b border-[#9aa5ad] px-2 py-1 dark:border-[#4a5c52]">
                  구분
                </th>
                <th className="border-b border-[#9aa5ad] px-2 py-1 dark:border-[#4a5c52]">
                  {slice.kind === "todo" ? "할 일" : "내용"}
                </th>
                {showFrame ? (
                  <th className="border-b border-[#9aa5ad] px-2 py-1 dark:border-[#4a5c52]">
                    틀
                  </th>
                ) : null}
                {showDeadline ? (
                  <th className="border-b border-[#9aa5ad] px-2 py-1 dark:border-[#4a5c52]">
                    마감
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${slice.kind}-${r.title}-${i}`}
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
                  <td className="max-w-[10rem] truncate px-2 py-1">
                    {r.title}
                    {r.similarHits.length > 0 ? (
                      <span className="ml-1 text-[11px] text-[#b42318] dark:text-[#f0a8a0]">
                        (비슷함)
                      </span>
                    ) : null}
                  </td>
                  {showFrame ? (
                    <td className="whitespace-nowrap px-2 py-1">
                      {r.categoryLabel}
                    </td>
                  ) : null}
                  {showDeadline ? (
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
    </div>
  );
}

function FrameLine({ preview }: { preview: MappedPreviewRow[] }) {
  const counts = new Map<TaskCategory, number>();
  for (const r of preview) {
    if (r.delta !== "new" && r.delta !== "changed") continue;
    counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  }
  const entries = [...counts.entries()];
  if (entries.length === 0) return null;
  return (
    <p
      className="text-[12px] text-[var(--ink-muted)]"
      data-excel-import-frames
    >
      틀:{" "}
      {entries
        .map(([cat, n]) => `${CATEGORY_LABEL[cat]} ${n}건`)
        .join(" · ")}
    </p>
  );
}
