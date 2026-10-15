"use client";

import { useMemo } from "react";
import {
  CATEGORY_LABEL,
  KIND_LABEL,
  type Task,
  type TaskCategory,
  type TaskKind,
} from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

interface TodoGridProps {
  tasks: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  hideCategory?: boolean;
  onAddItem?: () => void;
}

const KIND_ORDER: TaskKind[] = ["spot", "ongoing", "someday"];

const KIND_SECTION: Record<TaskKind, string> = {
  spot: "오늘 · 스팟",
  ongoing: "진행 중 · 지속",
  someday: "언젠가",
};

export function TodoGrid({
  tasks,
  onUpdate,
  onComplete,
  onDelete,
  hideCategory,
  onAddItem,
}: TodoGridProps) {
  const rows = useMemo(() => {
    const result: Array<
      | { type: "section"; kind: TaskKind; label: string }
      | { type: "task"; task: Task }
    > = [];
    for (const kind of KIND_ORDER) {
      const items = tasks.filter((t) => t.kind === kind);
      if (items.length === 0) continue;
      result.push({ type: "section", kind, label: KIND_SECTION[kind] });
      for (const task of items) result.push({ type: "task", task });
    }
    return result;
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-[var(--grid-line)] bg-[var(--sheet)] px-4 py-14 text-center">
        <p className="text-base font-semibold text-[var(--ink)]">
          이 틀에 할 일이 없습니다
        </p>
        <p className="max-w-sm text-sm text-[var(--ink-muted)]">
          「행 추가」로 새 줄을 넣고, 엑셀처럼 칸을 바로 고치세요.
        </p>
        {onAddItem ? (
          <Button type="button" size="lg" className="min-h-11" onClick={onAddItem}>
            <Plus className="size-4" />
            행 추가
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-[var(--grid-line)] bg-[var(--sheet)]">
        <table className="w-full min-w-[920px] border-collapse text-[15px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--brand)] text-left text-[14px] font-semibold text-[var(--primary-foreground)]">
              <th className="w-12 px-3 py-3 text-center">완료</th>
              <th className="min-w-[200px] px-3 py-3">제목</th>
              <th className="w-[140px] px-3 py-3">종류</th>
              <th className="w-[130px] px-3 py-3">목표기일</th>
              <th className="w-[72px] px-3 py-3 text-center">중요</th>
              {!hideCategory ? (
                <th className="w-[100px] px-3 py-3">틀</th>
              ) : null}
              <th className="min-w-[160px] px-3 py-3">메모</th>
              <th className="w-14 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (row.type === "section") {
                return (
                  <tr
                    key={`sec-${row.kind}`}
                    className="bg-[var(--sheet-header)]"
                  >
                    <td
                      colSpan={hideCategory ? 7 : 8}
                      className="border-b border-[var(--grid-line)] px-3 py-2 text-[13px] font-semibold tracking-wide text-[var(--brand)]"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }
              const task = row.task;
              return (
                <tr
                  key={task.id}
                  className="border-b border-[var(--grid-line)] hover:bg-[var(--row-hover)]"
                >
                  <td className="px-3 py-2.5 text-center align-middle">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => onComplete(task.id)}
                      aria-label={`${task.title} 완료 → 한 일로 이동`}
                      className="size-5"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      value={task.title}
                      onChange={(e) =>
                        onUpdate(task.id, { title: e.target.value })
                      }
                      className="h-10 border-transparent bg-transparent px-2 text-[15px] font-medium shadow-none focus-visible:border-[var(--grid-line)] focus-visible:bg-white"
                      aria-label="할 일 제목"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Select
                      value={task.kind}
                      onValueChange={(v) =>
                        onUpdate(task.id, {
                          kind: v as TaskKind,
                          targetDate:
                            v === "someday"
                              ? null
                              : task.targetDate ??
                                new Date().toISOString().slice(0, 10),
                        })
                      }
                    >
                      <SelectTrigger className="h-10 w-full bg-transparent">
                        <SelectValue>{KIND_LABEL[task.kind]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {KIND_LABEL[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      type="date"
                      value={task.targetDate ?? ""}
                      disabled={task.kind === "someday"}
                      onChange={(e) =>
                        onUpdate(task.id, {
                          targetDate: e.target.value || null,
                        })
                      }
                      className="h-10 bg-transparent disabled:opacity-40"
                      aria-label="목표기일"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <ScoreSelect
                      value={task.importance}
                      onChange={(n) => onUpdate(task.id, { importance: n })}
                      label="중요"
                    />
                  </td>
                  {!hideCategory ? (
                    <td className="px-2 py-1.5 align-middle">
                      <Select
                        value={task.category}
                        onValueChange={(v) =>
                          onUpdate(task.id, {
                            category: v as TaskCategory,
                          })
                        }
                      >
                        <SelectTrigger className="h-10 w-full bg-transparent">
                          <SelectValue>
                            {CATEGORY_LABEL[task.category]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.keys(CATEGORY_LABEL) as TaskCategory[]
                          ).map((c) => (
                            <SelectItem key={c} value={c}>
                              {CATEGORY_LABEL[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  ) : null}
                  <td className="px-2 py-1.5 align-middle">
                    <Input
                      value={task.memo}
                      placeholder="메모"
                      onChange={(e) =>
                        onUpdate(task.id, { memo: e.target.value })
                      }
                      className="h-10 border-transparent bg-transparent px-2 shadow-none focus-visible:border-[var(--grid-line)] focus-visible:bg-white"
                      aria-label="메모"
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center align-middle">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-10 text-[var(--ink-muted)]"
                      onClick={() => onDelete(task.id)}
                      aria-label="삭제"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {onAddItem ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11"
          onClick={onAddItem}
        >
          <Plus className="size-4" />
          행 추가
        </Button>
      ) : null}
      <p className="text-[13px] text-[var(--ink-muted)]">
        정렬: 스팟 → 지속 → 언젠가 · 칸을 바로 고치면 저장됩니다 · 완료 체크 시
        한 일로 이동
      </p>
    </div>
  );
}

function ScoreSelect({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-10 w-full justify-center bg-transparent" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {[1, 2, 3].map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
