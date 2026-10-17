"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SideListItem, SideListKind } from "@/lib/types";
import { SIDE_LIST_LABEL } from "@/lib/types";

interface SideListSectionProps {
  kind: SideListKind;
  items: SideListItem[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<SideListItem>) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
}

/** Compact so PC side-by-side pair fits; ~4 denser rows before scroll. */
const LIST_MAX_HEIGHT_CLASS =
  "max-h-[min(16rem,calc(4*3.9rem))] lg:max-h-[min(18rem,calc(4*4.1rem))]";

/**
 * Unified 지침/습관 — same list on 「할 일」 and 「한 일」 tabs.
 * No 완료 checkbox / filter.
 */
export function SideListSection({
  kind,
  items,
  onAdd,
  onUpdate,
  onDelete: _onDelete,
  onDeleteMany,
}: SideListSectionProps) {
  const label = SIDE_LIST_LABEL[kind];
  const accent =
    kind === "guideline"
      ? {
          border: "border-[#3b6ea5]/40",
          head: "from-[#e8f0fa] to-[#d9e6f5]",
          focus: "focus:border-[#3b6ea5]",
        }
      : {
          border: "border-[#2d7a4f]/40",
          head: "from-[#e8f5ee] to-[#d7ebe0]",
          focus: "focus:border-[#2d7a4f]",
        };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const paintRef = useRef<{
    active: boolean;
    mode: "add" | "remove";
  }>({ active: false, mode: "add" });

  // Unified: always show full list (no done split)
  const ordered = items;
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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allIds));
  }, [allIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const beginPaintSelect = useCallback((id: string, wasChecked: boolean) => {
    paintRef.current = {
      active: true,
      mode: wasChecked ? "remove" : "add",
    };
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (wasChecked) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const paintEnterRow = useCallback((id: string) => {
    if (!paintRef.current.active) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (paintRef.current.mode === "add") next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const end = () => {
      paintRef.current.active = false;
    };
    window.addEventListener("mouseup", end);
    return () => window.removeEventListener("mouseup", end);
  }, []);

  const bulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    onDeleteMany([...selectedIds]);
    clearSelection();
  }, [selectedIds, onDeleteMany, clearSelection]);

  const handleAdd = useCallback(() => {
    onAdd();
    requestAnimationFrame(() => {
      listScrollRef.current?.scrollTo({
        top: listScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [onAdd]);

  return (
    <section
      className={`overflow-hidden rounded-sm border ${accent.border} bg-white shadow-sm dark:bg-[#1a221e]`}
      data-side-list={kind}
      data-side-list-unified="1"
    >
      <div
        className={`flex flex-col gap-1.5 border-b border-[#c5ccd2] bg-gradient-to-b ${accent.head} px-2 py-1.5 dark:border-[#3a4a42] dark:from-[#24302a] dark:to-[#1e2823] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:px-2.5`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-sm px-1.5 py-0.5 text-[13px] font-bold text-[#1a2420] dark:text-[#e8eee9]"
            data-side-label={kind}
          >
            {label}
          </span>
          <p className="text-[13px] text-[#454d48] dark:text-[#a8b3ad]">
            {ordered.length}건
          </p>
          {ordered.length > 0 ? (
            <label className="flex min-h-10 items-center gap-1.5 text-[13px] text-[#454d48] dark:text-[#a8b3ad] sm:min-h-0">
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
      </div>

      <div
        ref={listScrollRef}
        className={`bg-white px-1.5 py-1 dark:bg-[#1a221e] sm:px-2 ${LIST_MAX_HEIGHT_CLASS} overflow-y-auto`}
        data-side-list-scroll={kind}
      >
        {ordered.length === 0 ? (
          <p className="px-2 py-5 text-center text-[13px] text-[#666] dark:text-[#a8b3ad]">
            {label}이 비어 있습니다. 「항목 추가」로 적으세요.
          </p>
        ) : (
          <ul ref={listRef} className="space-y-1">
            {ordered.map((item) => {
              const checked = selectedIds.has(item.id);
              return (
                <li
                  key={item.id}
                  data-side-item={item.id}
                  data-side-item-selected={checked ? "1" : "0"}
                  className={`flex flex-col gap-0.5 rounded-sm border px-1.5 py-1 sm:flex-row sm:items-start sm:px-2 ${
                    checked
                      ? "border-[#217346]/50 bg-[#e8f5ee] dark:border-[#3d8f82]/50 dark:bg-[#1e332d]"
                      : "border-[#c5ccd2] bg-[#fafbfc] dark:border-[#3a4a42] dark:bg-[#222c27]"
                  }`}
                >
                  <div
                    className="mt-1 flex shrink-0 items-center justify-center select-none"
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
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) =>
                        onUpdate(item.id, { title: e.target.value })
                      }
                      className={`h-10 min-h-10 w-full touch-manipulation rounded-sm border border-[#8a939a] bg-white px-2 text-[15px] text-[#1a2420] outline-none dark:border-[#4a5c52] dark:bg-[#1a221e] dark:text-[#e8ece9] sm:h-8 sm:min-h-8 ${accent.focus}`}
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
                      className="h-8 min-h-8 w-full touch-manipulation rounded-sm border border-[#d0d5d9] bg-white px-2 text-[12.5px] text-[#2a3230] outline-none focus:border-[#8a939a] dark:border-[#4a5c52] dark:bg-[#1a221e] dark:text-[#c5cec9] sm:h-6 sm:min-h-6"
                      aria-label={`${label} 메모`}
                      placeholder="메모 (선택)"
                      data-side-memo={item.id}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
