"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SideListItem, SideListKind } from "@/lib/types";
import { SIDE_LIST_LABEL } from "@/lib/types";

interface SideListSectionProps {
  kind: SideListKind;
  items: SideListItem[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<SideListItem>) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SideListSection({
  kind,
  items,
  onAdd,
  onUpdate,
  onToggle,
  onDelete,
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

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <section
      className={`overflow-hidden rounded-sm border ${accent.border} bg-[#f4f6f7] shadow-[0_1px_6px_rgba(26,43,54,0.08)]`}
      aria-label={label}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b border-[#9aa5ad]/60 bg-gradient-to-b ${accent.head} px-3 py-2.5`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`rounded-sm px-2 py-0.5 text-[13px] font-bold tracking-wide ${accent.badge}`}
          >
            {label}
          </span>
          <p className="text-[12px] text-[#5c655f]">
            장부 아래 별도 영역 · 틀과 섞이지 않음 · {items.length}건
          </p>
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
            {[...open, ...done].map((item) => (
              <li
                key={item.id}
                className={`flex flex-col gap-1.5 rounded-sm border border-[#c5ccd2] px-2.5 py-2 sm:flex-row sm:items-start ${
                  item.done ? "bg-[#f3f4f5] opacity-80" : "bg-[#fafbfc]"
                }`}
              >
                <label className="mt-1.5 flex shrink-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => onToggle(item.id)}
                    className="size-4 accent-[#217346]"
                    aria-label={`${label} 완료`}
                  />
                </label>
                <div className="min-w-0 flex-1 space-y-1">
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) =>
                      onUpdate(item.id, { title: e.target.value })
                    }
                    className={`h-9 w-full rounded-sm border border-[#8a939a] bg-white px-2 text-[15px] outline-none ${accent.focus} ${
                      item.done ? "line-through text-[#777]" : "text-[#1a2420]"
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
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
