"use client";

import type { Task } from "@/lib/types";
import { CATEGORY_LABEL, KIND_LABEL } from "@/lib/types";
import { EmptyState } from "@/components/panel-shell";
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
      <EmptyState
        title="한 일이 없습니다"
        description="할 일에서 체크하면 완료일과 함께 여기로 옵니다."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/40 px-3 py-3 sm:px-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-base font-medium text-[var(--ink)]">
                {task.title}
              </p>
              <p className="text-[12px] text-[var(--ink-muted)]">
                완료{" "}
                {task.completedAt
                  ? new Date(task.completedAt).toLocaleString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}{" "}
                · {CATEGORY_LABEL[task.category]} · {KIND_LABEL[task.kind]}
              </p>
              {task.memo ? (
                <p className="text-[12px] text-[var(--ink)]/70">
                  메모 · {task.memo}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-10"
                onClick={() => onRestore(task.id)}
              >
                <RotateCcw className="size-3.5" />
                복원
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                onClick={() => onDelete(task.id)}
                aria-label="삭제"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
