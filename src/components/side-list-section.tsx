"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SideListItem, SideListKind } from "@/lib/types";
import { SIDE_LIST_LABEL } from "@/lib/types";

/** active = 할 일 (미완료만) · done = 한 일 (완료만) */
export type SideListMode = "active" | "done";

interface SideListSectionProps {
  kind: SideListKind;
  items: SideListItem[];
  /** Which sheet this section sits under — filters + toolbar */
  mode?: SideListMode;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<SideListItem>) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onCompleteMany: (ids: string[]) => void;
}

/** Compact so PC side-by-side pair fits; ~4 rows before scroll. */
const LIST_MAX_HEIGHT_CLASS =
  "max-h-[min(18rem,calc(4*4.4rem))] lg:max-h-[min(20rem,calc(4*4.6rem))]";

export function SideListSection({
  kind,
  items,
  mode = "active",
  onAdd,
  onUpdate,
  onDelete: _onDelete,
  onDeleteMany,
  onCompleteMany,
}: SideListSectionProps) {
  const label = SIDE_LIST_LABEL[kind];
  const accent =
    kind === "guideline"
      ? {
          border: "border-[#3b6ea5]/40",
          head: "from-[#e8f0fa] to-[#d9e6f5]",
          badge: "bg-[#3b6ea5] text-white",
          focus: "focus:border-[#3b6ea5]",
        }
      : {
          border: "border-[#2d7a4f]/40",
          head: "from-[#e8f5ee] to-[#d7ebe0]",
          badge: "bg-[#2d7a4f] text-white",
          focus: "focus:border-[#2d7a4f]",
        };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** Completed items unlocked for editing via 「수정」. */
  const [editingDoneIds, setEditingDoneIds] = useState<Set<string>>(
    () => new Set(),
  );
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const paintRef = useRef<{
    active: boolean;
    mode: "add" | "remove";
  }>({ active: false, mode: "add" });

  /** 할 일 = open only · 한 일 = completed only (never mix on one sheet) */
  const visible = useMemo(() => {
    if (mode === "done") return items.filter((i) => i.done);
    return items.filter((i) => !i.done);
  }, [items, mode]);

  const ordered = visible;
  const showAdd = mode === "active";
  const showComplete = mode === "active";

  const allIds = useMemo(() => ordered.map((i) => i.id), [ordered]);
  const selectedCount = selectedIds.size;
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = allIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(ordered.map((i) => i.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [ordered]);

  useEffect(() => {
    setEditingDoneIds((prev) => {
      if (prev.size === 0) return prev;
      const doneAlive = new Set(
        ordered.filter((i) => i.done).map((i) => i.id),
      );
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (doneAlive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [ordered]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setSelectPaint = useCallback((id: string, mode: "add" | "remove") => {
    setSelectedIds((prev) => {
      const has = prev.has(id);
      if (mode === "add" && has) return prev;
      if (mode === "remove" && !has) return prev;
      const next = new Set(prev);
      if (mode === "add") next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const beginPaintSelect = useCallback(
    (id: string, currentlyChecked: boolean) => {
      const mode: "add" | "remove" = currentlyChecked ? "remove" : "add";
      paintRef.current = { active: true, mode };
      setSelectPaint(id, mode);
    },
    [setSelectPaint],
  );

  const paintEnterRow = useCallback(
    (id: string) => {
      if (!paintRef.current.active) return;
      setSelectPaint(id, paintRef.current.mode);
    },
    [setSelectPaint],
  );

  useEffect(() => {
    const endPaint = () => {
      paintRef.current.active = false;
    };
    const onMove = (e: MouseEvent) => {
      if (!paintRef.current.active) return;
      const scroller = listScrollRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const edge = 36;
      if (e.clientY < rect.top + edge) {
        scroller.scrollTop -= 18;
      } else if (e.clientY > rect.bottom - edge) {
        scroller.scrollTop += 18;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest?.("[data-side-select-cell]") as
        | HTMLElement
        | null
        | undefined;
      const id = cell?.dataset?.sideSelectCell;
      if (id) setSelectPaint(id, paintRef.current.mode);
    };
    window.addEventListener("mouseup", endPaint);
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mouseup", endPaint);
      window.removeEventListener("mousemove", onMove);
    };
  }, [setSelectPaint]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allIds));
  }, [allIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const bulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    onDeleteMany(ids);
    setSelectedIds(new Set());
  }, [onDeleteMany, selectedIds]);

  const bulkComplete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    onCompleteMany(ids);
    setSelectedIds(new Set());
  }, [onCompleteMany, selectedIds]);

  const beginEditDone = useCallback((id: string) => {
    setEditingDoneIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const endEditDone = useCallback((id: string) => {
    setEditingDoneIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    onAdd();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scroller = listScrollRef.current;
        const last = listRef.current?.lastElementChild as HTMLElement | null;
        if (last) {
          last.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else if (scroller) {
          scroller.scrollTop = scroller.scrollHeight;
        }
      });
    });
  }, [onAdd]);

  return (
    <section
      className={`min-w-0 overflow-hidden rounded-sm border ${accent.border} bg-[#f4f6f7] shadow-[0_1px_6px_rgba(26,43,54,0.08)] dark:bg-[#1a221e] dark:shadow-none`}
      aria-label={label}
      data-side-kind={kind}
      data-side-mode={mode}
    >
      <div
        className={`flex flex-col gap-1.5 border-b border-[#9aa5ad]/60 bg-gradient-to-b ${accent.head} px-2 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-2.5 sm:py-2`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-sm px-2 py-0.5 text-[14px] font-bold tracking-wide ${accent.badge}`}
          >
            {label}
          </span>
          <p className="text-[13px] text-[#454d48]">{ordered.length}건</p>
          {ordered.length > 0 ? (
            <label className="flex min-h-10 items-center gap-1.5 text-[13px] text-[#454d48] sm:min-h-0">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el)
                    el.indeterminate = someSelected && !allSelected;
                }}
                onChange={() => (allSelected ? clearSelection() : selectAll())}
                className="size-4 accent-[#217346] sm:size-3.5"
                aria-label={`${label} 모두 선택`}
                data-side-select-all={kind}
              />
              모두 선택
            </label>
          ) : null}
          {selectedCount > 0 ? (
            <div
              className="flex flex-row flex-wrap items-center gap-1.5"
              data-side-bulk-actions={kind}
            >
              {showComplete ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 min-h-10 touch-manipulation rounded-sm border-[#217346]/50 px-2.5 text-[13px] text-[#217346] sm:h-9 sm:min-h-9"
                  onClick={bulkComplete}
                  data-side-bulk-complete={kind}
                >
                  <Check className="size-3.5" />
                  완료
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 min-h-10 touch-manipulation rounded-sm border-[#b42318]/40 px-2.5 text-[13px] text-[#b42318] sm:h-9 sm:min-h-9"
                onClick={bulkDelete}
                data-side-bulk-delete={kind}
              >
                <Trash2 className="size-3.5" />
                선택 삭제
              </Button>
            </div>
          ) : null}
        </div>
        {showAdd ? (
          <Button
            type="button"
            size="sm"
            className={`h-10 min-h-10 w-full touch-manipulation rounded-sm px-2.5 text-[13px] text-white sm:h-8 sm:min-h-8 sm:w-auto ${
              kind === "guideline"
                ? "bg-[#3b6ea5] hover:bg-[#2f5a88]"
                : "bg-[#2d7a4f] hover:bg-[#246340]"
            }`}
            onClick={handleAdd}
            data-side-add={kind}
          >
            <Plus className="size-3.5" />
            항목 추가
          </Button>
        ) : null}
      </div>

      <div
        ref={listScrollRef}
        className={`bg-white px-1.5 py-1.5 dark:bg-[#1a221e] sm:px-2 ${LIST_MAX_HEIGHT_CLASS} overflow-y-auto`}
        data-side-list-scroll={kind}
        data-side-list-mode={mode}
      >
        {ordered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-[#666] dark:text-[#a8b3ad]">
            {mode === "done"
              ? `완료한 ${label}이 없습니다.`
              : `${label}이 비어 있습니다. 「항목 추가」로 적으세요.`}
          </p>
        ) : (
          <ul ref={listRef} className="space-y-1.5">
            {ordered.map((item) => {
              const checked = selectedIds.has(item.id);
              const editingDone = editingDoneIds.has(item.id);
              const locked = item.done && !editingDone;
              return (
                <li
                  key={item.id}
                  data-side-item={item.id}
                  data-side-item-selected={checked ? "1" : "0"}
                  data-side-item-done={item.done ? "1" : "0"}
                  data-side-item-locked={locked ? "1" : "0"}
                  className={`flex flex-col gap-1 rounded-sm border px-2 py-1.5 sm:flex-row sm:items-start ${
                    checked
                      ? "border-[#217346]/50 bg-[#e8f5ee] dark:border-[#3d8f82]/50 dark:bg-[#1e332d]"
                      : item.done
                        ? "border-[#217346]/35 bg-[#eef6f1] dark:border-[#3d8f82]/35 dark:bg-[#1c2822]"
                        : "border-[#c5ccd2] bg-[#fafbfc] dark:border-[#3a4a42] dark:bg-[#222c27]"
                  }`}
                >
                  <div
                    className="mt-1.5 flex shrink-0 items-center justify-center select-none"
                    data-side-select-cell={item.id}
                    title="클릭하거나 드래그해서 여러 항목 선택"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      beginPaintSelect(item.id, checked);
                    }}
                    onMouseEnter={() => paintEnterRow(item.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleSelect(item.id);
                        }
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        beginPaintSelect(item.id, checked);
                      }}
                      className="size-4 accent-[#217346]"
                      aria-label={`${label} 선택`}
                      data-side-row-check={item.id}
                      title="항목 선택"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    {item.done ? (
                      <div
                        className="mb-0.5 flex flex-wrap items-center gap-1.5"
                        data-side-done-badge={item.id}
                      >
                        <span className="inline-flex items-center gap-1 rounded-sm bg-[#217346] px-1.5 py-0.5 text-[12px] font-bold text-white">
                          <Check className="size-3.5 stroke-[3]" aria-hidden />
                          완료됨
                        </span>
                        {locked ? (
                          <span className="text-[12px] font-medium text-[#5a6b62]">
                            수정하려면 「수정」을 누르세요
                          </span>
                        ) : (
                          <span className="text-[12px] font-medium text-[#217346]">
                            수정 중
                          </span>
                        )}
                      </div>
                    ) : null}
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) =>
                        onUpdate(item.id, { title: e.target.value })
                      }
                      onBlur={(e) => {
                        if (!item.done) return;
                        const next = e.relatedTarget as Node | null;
                        const row = e.currentTarget.closest(
                          "[data-side-item]",
                        );
                        // Stay editing while focus moves within the same row
                        // (memo ↔ title ↔ 「수정 끝」). Relock only on leave.
                        if (row && next && row.contains(next)) return;
                        endEditDone(item.id);
                      }}
                      disabled={locked}
                      readOnly={locked}
                      className={`h-9 w-full rounded-sm border px-2 text-[15px] outline-none dark:border-[#4a5c52] ${
                        locked
                          ? "cursor-default border-[#b7c4bc] bg-[#e4ebe6] text-[#6a7670] opacity-90 dark:bg-[#24302a] dark:text-[#8a9490]"
                          : item.done
                            ? `border-[#8a939a] bg-white text-[#3a4540] dark:bg-[#1a221e] dark:text-[#c5cec9] ${accent.focus}`
                            : `border-[#8a939a] bg-white text-[#1a2420] dark:bg-[#1a221e] dark:text-[#e8ece9] ${accent.focus}`
                      }`}
                      aria-label={`${label} 제목`}
                      placeholder={`${label} 내용`}
                      data-side-title={item.id}
                    />
                    <input
                      type="text"
                      value={item.memo}
                      onChange={(e) =>
                        onUpdate(item.id, { memo: e.target.value })
                      }
                      onBlur={(e) => {
                        if (!item.done) return;
                        const next = e.relatedTarget as Node | null;
                        const row = e.currentTarget.closest(
                          "[data-side-item]",
                        );
                        if (row && next && row.contains(next)) return;
                        endEditDone(item.id);
                      }}
                      disabled={locked}
                      readOnly={locked}
                      className={`h-7 w-full rounded-sm border px-2 text-[12.5px] outline-none dark:border-[#4a5c52] ${
                        locked
                          ? "cursor-default border-[#c5d0c9] bg-[#e8eee9] text-[#7a8680] dark:bg-[#24302a] dark:text-[#8a9490]"
                          : "border-[#d0d5d9] bg-white text-[#2a3230] focus:border-[#8a939a] dark:bg-[#1a221e] dark:text-[#c5cec9]"
                      }`}
                      aria-label={`${label} 메모`}
                      placeholder="메모 (선택)"
                      data-side-memo={item.id}
                    />
                  </div>
                  {/* 삭제는 선택 후 「선택 삭제」만 — 행마다 삭제 버튼 없음 */}
                  {item.done ? (
                    <div className="flex shrink-0 flex-row gap-1.5 self-end sm:flex-col sm:self-start">
                      {locked ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center gap-1 rounded-sm border border-[#217346]/45 bg-white px-2 text-[13px] font-medium text-[#217346] hover:bg-[#e8f5ee]"
                          onClick={() => beginEditDone(item.id)}
                          aria-label={`${label} 수정`}
                          data-side-edit={item.id}
                        >
                          <Pencil className="size-3.5" />
                          수정
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center gap-1 rounded-sm border border-[#217346] bg-[#217346] px-2 text-[13px] font-medium text-white hover:bg-[#1a5c38]"
                          onMouseDown={(e) => {
                            // Keep focus in the row so title/memo blur does not
                            // re-lock before this click runs.
                            e.preventDefault();
                          }}
                          onClick={() => endEditDone(item.id)}
                          aria-label={`${label} 수정 끝내기`}
                          data-side-edit-done={item.id}
                        >
                          <Check className="size-3.5" />
                          수정 끝
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
