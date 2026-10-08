"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SideListItem, SideListKind } from "@/lib/types";
import { SIDE_LIST_LABEL } from "@/lib/types";

interface SideListSectionProps {
  kind: SideListKind;
  items: SideListItem[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<SideListItem>) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
}

export function SideListSection({
  kind,
  items,
  onAdd,
  onUpdate,
  onToggle,
  onDelete,
  onDeleteMany,
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ordered = useMemo(() => {
    const open = items.filter((i) => !i.done);
    const done = items.filter((i) => i.done);
    return [...open, ...done];
  }, [items]);

  const allIds = useMemo(() => ordered.map((i) => i.id), [ordered]);
  const selectedCount = selectedIds.size;
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = allIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(items.map((i) => i.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [items]);

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

  const confirmDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    onDeleteMany(ids);
    setSelectedIds(new Set());
    setConfirmOpen(false);
  }, [onDeleteMany, selectedIds]);

  return (
    <section
      className={`overflow-hidden rounded-sm border ${accent.border} bg-[#f4f6f7] shadow-[0_1px_6px_rgba(26,43,54,0.08)]`}
      aria-label={label}
      data-side-kind={kind}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b border-[#9aa5ad]/60 bg-gradient-to-b ${accent.head} px-3 py-2.5`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-sm px-2 py-0.5 text-[13px] font-bold tracking-wide ${accent.badge}`}
          >
            {label}
          </span>
          <p className="text-[12px] text-[#5c655f]">
            장부 아래 별도 영역 · 틀과 섞이지 않음 · {items.length}건
          </p>
          {items.length > 0 ? (
            <label className="flex items-center gap-1.5 text-[12px] text-[#5c655f]">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el)
                    el.indeterminate = someSelected && !allSelected;
                }}
                onChange={() => (allSelected ? clearSelection() : selectAll())}
                className="size-3.5 accent-[#217346]"
                aria-label={`${label} 모두 선택`}
                data-side-select-all={kind}
              />
              모두 선택
            </label>
          ) : null}
          {selectedCount > 0 ? (
            <>
              <span
                className="rounded-sm border border-[#8a939a]/50 bg-white px-2 py-0.5 text-[12px] font-semibold text-[#1a2420]"
                data-side-selection-count={kind}
              >
                {selectedCount}개 선택
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-sm px-2 text-[12px]"
                onClick={clearSelection}
              >
                선택 해제
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-sm border-[#b42318]/40 px-2 text-[12px] text-[#b42318]"
                onClick={() => setConfirmOpen(true)}
                data-side-bulk-delete={kind}
              >
                <Trash2 className="size-3.5" />
                선택 삭제
              </Button>
            </>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          className={`h-8 rounded-sm px-3 text-white ${
            kind === "guideline"
              ? "bg-[#3b6ea5] hover:bg-[#2f5a88]"
              : "bg-[#2d7a4f] hover:bg-[#246340]"
          }`}
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
          항목 추가
        </Button>
      </div>

      <div className="bg-white px-2 py-2 sm:px-3">
        {items.length === 0 ? (
          <p className="px-2 py-8 text-center text-[14px] text-[#666]">
            {label}이 비어 있습니다. 「항목 추가」로 적으세요.
          </p>
        ) : (
          <ul className="space-y-2">
            {ordered.map((item) => {
              const checked = selectedIds.has(item.id);
              return (
                <li
                  key={item.id}
                  data-side-item={item.id}
                  data-side-item-selected={checked ? "1" : "0"}
                  className={`flex flex-col gap-1.5 rounded-sm border px-2.5 py-2 sm:flex-row sm:items-start ${
                    checked
                      ? "border-[#217346]/50 bg-[#e8f5ee]"
                      : item.done
                        ? "border-[#c5ccd2] bg-[#f3f4f5] opacity-80"
                        : "border-[#c5ccd2] bg-[#fafbfc]"
                  }`}
                >
                  <div className="mt-1.5 flex shrink-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(item.id)}
                      className="size-4 accent-[#217346]"
                      aria-label={`${label} 선택`}
                      data-side-row-check={item.id}
                      title="삭제할 항목 선택"
                    />
                    <label className="flex items-center gap-1.5 text-[11px] text-[#5c655f]">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => onToggle(item.id)}
                        className="size-4 accent-[#217346]"
                        aria-label={`${label} 완료`}
                      />
                      완료
                    </label>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) =>
                        onUpdate(item.id, { title: e.target.value })
                      }
                      className={`h-9 w-full rounded-sm border border-[#8a939a] bg-white px-2 text-[15px] outline-none ${accent.focus} ${
                        item.done
                          ? "text-[#777] line-through"
                          : "text-[#1a2420]"
                      }`}
                      aria-label={`${label} 제목`}
                      placeholder={`${label} 내용`}
                    />
                    <input
                      type="text"
                      value={item.memo}
                      onChange={(e) =>
                        onUpdate(item.id, { memo: e.target.value })
                      }
                      className="h-8 w-full rounded-sm border border-[#d0d5d9] bg-white px-2 text-[13px] text-[#444] outline-none focus:border-[#8a939a]"
                      aria-label={`${label} 메모`}
                      placeholder="메모 (선택)"
                    />
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1 self-end rounded-sm border border-[#8a939a] bg-white px-2 text-[12px] text-[#5c655f] hover:bg-[#f0f2f4] sm:self-start"
                    onClick={() => onDelete(item.id)}
                    aria-label={`${label} 삭제`}
                  >
                    <Trash2 className="size-3.5" />
                    삭제
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{label} 선택 삭제</DialogTitle>
            <DialogDescription>
              선택한 {selectedCount}개의 {label}을 삭제할까요? 삭제하면 이
              기기에서 바로 지워집니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-sm"
              onClick={() => setConfirmOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              className="rounded-sm bg-[#b42318] text-white hover:bg-[#912018]"
              onClick={confirmDelete}
              data-side-confirm-delete={kind}
            >
              <Trash2 className="size-3.5" />
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
