"use client";

import type { Task } from "@/lib/types";
import { KIND_LABEL, SOURCE_LABEL } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trash2 } from "lucide-react";

interface CompletionLogProps {
  tasks: Task[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function CompletionLog({
  tasks,
  onRestore,
  onDelete,
  onClearAll,
}: CompletionLogProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-[var(--grid-line)] bg-[var(--sheet)] px-4 py-16 text-center">
        <p className="text-base font-medium text-[var(--ink)]">
          완료 기록이 비어 있습니다
        </p>
        <p className="max-w-sm text-sm text-[var(--ink-muted)]">
          할 일 표에서 완료하면 이곳에 완료일과 함께 쌓입니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--ink-muted)]">
          완료 {tasks.length}건 · 최신순
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onClearAll}>
          <Trash2 className="size-3.5" />
          기록 비우기
        </Button>
      </div>
      <div className="overflow-x-auto border border-[var(--grid-line)] bg-[var(--sheet)]">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--sheet-header)] text-left text-[12px] font-semibold text-[var(--ink-muted)]">
              <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
                완료일
              </th>
              <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
                내용
              </th>
              <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
                유형
              </th>
              <th className="border-b border-[var(--grid-line)] px-3 py-2.5">
                출처
              </th>
              <th className="w-24 border-b border-[var(--grid-line)] px-2 py-2.5" />
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
                  {KIND_LABEL[task.kind]}
                </td>
                <td className="border-b border-[var(--grid-line)] px-3 py-2.5 text-[var(--ink-muted)]">
                  {SOURCE_LABEL[task.source]}
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
    </div>
  );
}
