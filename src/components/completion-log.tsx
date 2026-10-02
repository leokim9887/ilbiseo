"use client";

import type { Task } from "@/lib/types";
import { CATEGORY_LABEL, KIND_LABEL } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trash2 } from "lucide-react";

interface CompletionLogProps {
  tasks: Task[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CompletionLog({
  tasks,
  onRestore,
  onDelete,
}: CompletionLogProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-[var(--grid-line)] bg-[var(--sheet)] px-4 py-12 text-center">
        <p className="text-base font-medium text-[var(--ink)]">한 일이 없습니다</p>
        <p className="max-w-sm text-sm text-[var(--ink-muted)]">
          할 일에서 완료하면 완료일과 함께 여기로 이동합니다.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-[var(--grid-line)] bg-[var(--sheet)]">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--sheet-header)] text-left text-[12px] font-semibold text-[var(--ink-muted)]">
            <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
              완료일
            </th>
            <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
              한 일
            </th>
            <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
              틀
            </th>
            <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
              유형
            </th>
            <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
              메모
            </th>
            <th className="w-28 border-b border-[var(--grid-line)] px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="hover:bg-[var(--row-hover)]">
              <td className="border-b border-[var(--grid-line)] px-3 py-2.5 whitespace-nowrap text-[var(--ink-muted)]">
                {task.completedAt
                  ? new Date(task.completedAt).toLocaleString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </td>
              <td className="border-b border-[var(--grid-line)] px-3 py-2.5 font-medium">
                {task.title}
              </td>
              <td className="border-b border-[var(--grid-line)] px-3 py-2.5 text-[var(--ink-muted)]">
                {CATEGORY_LABEL[task.category]}
              </td>
              <td className="border-b border-[var(--grid-line)] px-3 py-2.5 text-[var(--ink-muted)]">
                {KIND_LABEL[task.kind]}
              </td>
              <td className="border-b border-[var(--grid-line)] px-3 py-2.5 text-[12px] text-[var(--ink-muted)]">
                {task.memo || "—"}
              </td>
              <td className="border-b border-[var(--grid-line)] px-2 py-1.5">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRestore(task.id)}
                  >
                    <RotateCcw className="size-3.5" />
                    복원
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDelete(task.id)}
                    aria-label="삭제"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
