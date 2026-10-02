"use client";

import { useState } from "react";
import type { ChecklistItem, TaskCategory } from "@/lib/types";
import { EmptyState } from "@/components/panel-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

interface ChecklistPanelProps {
  items: ChecklistItem[];
  category: TaskCategory;
  onAdd: (title: string, category: TaskCategory) => void;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  /** When inside PanelShell, skip outer chrome */
  bare?: boolean;
}

export function ChecklistPanel({
  items,
  category,
  onAdd,
  onToggle,
  onDelete,
  bare = false,
}: ChecklistPanelProps) {
  const [title, setTitle] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    onAdd(title, category);
    setTitle("");
  };

  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  const body = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ink-muted)]">
        <span className="rounded-md bg-[var(--group-bg)] px-2 py-0.5 text-[12px] font-semibold text-[var(--brand)]">
          남음 {open.length}
        </span>
        <span className="text-[12px]">완료 {done.length}</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={title}
          placeholder="체크 항목 적기"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="h-11 text-base"
        />
        <Button
          type="button"
          size="lg"
          className="min-h-11 shrink-0"
          onClick={submit}
        >
          <Plus className="size-4" />
          추가
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="체크 항목이 없습니다"
          description="위칸에 적고 「추가」를 누르세요."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/30 px-3 py-3"
            >
              <Checkbox
                checked={item.checked}
                onCheckedChange={(v) => onToggle(item.id, Boolean(v))}
                className="size-5"
              />
              <span
                className={`flex-1 text-base ${item.checked ? "text-[var(--ink-muted)] line-through" : "text-[var(--ink)]"}`}
              >
                {item.title}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 shrink-0"
                onClick={() => onDelete(item.id)}
                aria-label="삭제"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (bare) return body;

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--grid-line)] bg-[var(--sheet)] p-4">
      <p className="text-sm font-semibold text-[var(--ink)]">체크리스트</p>
      {body}
    </div>
  );
}
