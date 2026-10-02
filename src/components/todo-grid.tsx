"use client";

import { Fragment } from "react";
import {
  CATEGORY_LABEL,
  KIND_LABEL,
  SOURCE_LABEL,
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
import { Trash2 } from "lucide-react";

interface TodoGridProps {
  tasks: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  /** When true, hide category column (already filtered by frame) */
  hideCategory?: boolean;
}

export function TodoGrid({
  tasks,
  onUpdate,
  onComplete,
  onDelete,
  hideCategory,
}: TodoGridProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-[var(--grid-line)] bg-[var(--sheet)] px-4 py-12 text-center">
        <p className="text-base font-medium text-[var(--ink)]">할 일이 없습니다</p>
        <p className="max-w-sm text-sm text-[var(--ink-muted)]">
          행을 추가하거나 메모·OCR로 가져오면 여기에 정렬됩니다.
        </p>
      </div>
    );
  }

  let lastGroup = "";

  return (
    <div className="overflow-x-auto border border-[var(--grid-line)] bg-[var(--sheet)]">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--sheet-header)] text-left text-[12px] font-semibold text-[var(--ink-muted)]">
            <th className="w-10 border-b border-[var(--grid-line)] px-2 py-2.5 text-center">
              완료
            </th>
            <th className="min-w-[180px] border-b border-[var(--grid-line)] px-3 py-2.5">
              할 일
            </th>
            <th className="min-w-[120px] border-b border-[var(--grid-line)] px-2 py-2.5">
              메모
            </th>
            {!hideCategory ? (
              <th className="w-[100px] border-b border-[var(--grid-line)] px-2 py-2.5">
                틀
              </th>
            ) : null}
            <th className="w-[120px] border-b border-[var(--grid-line)] px-2 py-2.5">
              유형
            </th>
            <th className="w-[120px] border-b border-[var(--grid-line)] px-2 py-2.5">
              목표기일
            </th>
            <th className="w-[64px] border-b border-[var(--grid-line)] px-2 py-2.5">
              시급
            </th>
            <th className="w-[64px] border-b border-[var(--grid-line)] px-2 py-2.5">
              중요
            </th>
            <th className="w-[72px] border-b border-[var(--grid-line)] px-2 py-2.5">
              출처
            </th>
            <th className="w-10 border-b border-[var(--grid-line)] px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const showGroup =
              task.groupKey && task.groupKey !== lastGroup
                ? task.groupKey
                : null;
            if (task.groupKey) lastGroup = task.groupKey;
            const kindAccent =
              task.kind === "spot"
                ? "border-l-[3px] border-l-[var(--accent-spot)]"
                : task.kind === "ongoing"
                  ? "border-l-[3px] border-l-[var(--accent-ongoing)]"
                  : "border-l-[3px] border-l-[var(--accent-someday)]";
            const cols = hideCategory ? 9 : 10;

            return (
              <Fragment key={task.id}>
                {showGroup ? (
                  <tr className="bg-[var(--group-bg)]">
                    <td
                      colSpan={cols}
                      className="border-b border-[var(--grid-line)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-muted)]"
                    >
                      묶음 · {showGroup}
                    </td>
                  </tr>
                ) : null}
                <tr className={`group hover:bg-[var(--row-hover)] ${kindAccent}`}>
                  <td className="border-b border-[var(--grid-line)] px-2 py-1.5 text-center">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => onComplete(task.id)}
                      aria-label={`${task.title} 완료`}
                    />
                  </td>
                  <td className="border-b border-[var(--grid-line)] px-1 py-1">
                    <Input
                      value={task.title}
                      onChange={(e) =>
                        onUpdate(task.id, { title: e.target.value })
                      }
                      className="h-8 border-transparent bg-transparent px-2 shadow-none"
                    />
                  </td>
                  <td className="border-b border-[var(--grid-line)] px-1 py-1">
                    <Input
                      value={task.memo}
                      placeholder="메모"
                      onChange={(e) =>
                        onUpdate(task.id, { memo: e.target.value })
                      }
                      className="h-8 border-transparent bg-transparent px-2 text-[12px] shadow-none"
                    />
                  </td>
                  {!hideCategory ? (
                    <td className="border-b border-[var(--grid-line)] px-1 py-1">
                      <Select
                        value={task.category}
                        onValueChange={(v) =>
                          onUpdate(task.id, { category: v as TaskCategory })
                        }
                      >
                        <SelectTrigger className="h-8 border-transparent bg-transparent shadow-none">
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
                  <td className="border-b border-[var(--grid-line)] px-1 py-1">
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
                      <SelectTrigger className="h-8 border-transparent bg-transparent shadow-none">
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
                  <td className="border-b border-[var(--grid-line)] px-1 py-1">
                    <Input
                      type="date"
                      value={task.targetDate ?? ""}
                      disabled={task.kind === "someday"}
                      onChange={(e) =>
                        onUpdate(task.id, {
                          targetDate: e.target.value || null,
                        })
                      }
                      className="h-8 border-transparent bg-transparent px-2 shadow-none disabled:opacity-40"
                    />
                  </td>
                  <td className="border-b border-[var(--grid-line)] px-1 py-1">
                    <ScoreSelect
                      value={task.urgency}
                      onChange={(n) => onUpdate(task.id, { urgency: n })}
                    />
                  </td>
                  <td className="border-b border-[var(--grid-line)] px-1 py-1">
                    <ScoreSelect
                      value={task.importance}
                      onChange={(n) => onUpdate(task.id, { importance: n })}
                    />
                  </td>
                  <td className="border-b border-[var(--grid-line)] px-2 py-1.5 text-[12px] text-[var(--ink-muted)]">
                    {SOURCE_LABEL[task.source]}
                  </td>
                  <td className="border-b border-[var(--grid-line)] px-1 py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => onDelete(task.id)}
                      aria-label="삭제"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScoreSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-8 border-transparent bg-transparent shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {[1, 2, 3, 4, 5].map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
