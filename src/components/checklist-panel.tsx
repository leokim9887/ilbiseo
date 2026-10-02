"use client";

import { useState } from "react";
import type { ChecklistItem, TaskCategory } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListChecks, Trash2 } from "lucide-react";

interface ChecklistPanelProps {
  items: ChecklistItem[];
  category: TaskCategory;
  onAdd: (title: string, category: TaskCategory) => void;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

export function ChecklistPanel({
  items,
  category,
  onAdd,
  onToggle,
  onDelete,
}: ChecklistPanelProps) {
  const [title, setTitle] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    onAdd(title, category);
    setTitle("");
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--grid-line)] bg-[var(--sheet)] p-4">
      <div className="flex items-center gap-2">
        <ListChecks className="size-4 text-[var(--brand)]" />
        <p className="text-sm font-semibold text-[var(--ink)]">체크리스트</p>
        <span className="text-[11px] text-[var(--ink-muted)]">
          미완료 {items.filter((i) => !i.checked).length} / 전체 {items.length}
        </span>
      </div>
      <div className="flex gap-2">
        <Input
          value={title}
          placeholder="체크 항목 추가"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="h-8"
        />
        <Button type="button" size="sm" onClick={submit}>
          추가
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--ink-muted)]">
          아직 체크 항목이 없습니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--row-hover)]"
            >
              <Checkbox
                checked={item.checked}
                onCheckedChange={(v) => onToggle(item.id, Boolean(v))}
              />
              <span
                className={`flex-1 text-sm ${item.checked ? "text-[var(--ink-muted)] line-through" : "text-[var(--ink)]"}`}
              >
                {item.title}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(item.id)}
                aria-label="삭제"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
