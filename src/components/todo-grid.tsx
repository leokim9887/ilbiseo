"use client";

import { KIND_LABEL, SOURCE_LABEL, type Task, type TaskKind } from "@/lib/types";
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
}

export function TodoGrid({
  tasks,
  onUpdate,
  onComplete,
  onDelete,
}: TodoGridProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-[var(--grid-line)] bg-[var(--sheet)] px-4 py-16 text-center">
        <p className="text-base font-medium text-[var(--ink)]">
          아직 할 일이 없습니다
        </p>
        <p className="max-w-sm text-sm text-[var(--ink-muted)]">
          행을 추가하거나, 메모·OCR·캘린더로 가져오면 여기에 정렬됩니다.
        </p>
      </div>
    );
  }

  let lastGroup = "";

  return (
    <div className="overflow-x-auto border border-[var(--grid-line)] bg-[var(--sheet)] shadow-[0_1px_0_rgba(20,40,60,0.04)]">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--sheet-header)] text-left text-[12px] font-semibold tracking-wide text-[var(--ink-muted)]">
            <th className="w-10 border-b border-[var(--grid-line)] px-2 py-2.5 text-center">
              완료
            </th>
            <th className="min-w-[220px] border-b border-[var(--grid-line)] px-3 py-2.5">
              할 일
            </th>
            <th className="w-[130px] border-b border-[var(--grid-line)] px-2 py-2.5">
              유형
            </th>
            <th className="w-[128px] border-b border-[var(--grid-line)] px-2 py-2.5">
              목표기일
            </th>
            <th className="w-[72px] border-b border-[var(--grid-line)] px-2 py-2.5">
              시급
            </th>
            <th className="w-[72px] border-b border-[var(--grid-line)] px-2 py-2.5">
              중요
            </th>
            <th className="w-[88px] border-b border-[var(--grid-line)] px-2 py-2.5">
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

            return (
              <TaskRows
                key={task.id}
                task={task}
                groupLabel={showGroup}
                onUpdate={onUpdate}
                onComplete={onComplete}
                onDelete={onDelete}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TaskRows({
  task,
  groupLabel,
  onUpdate,
  onComplete,
  onDelete,
}: {
  task: Task;
  groupLabel: string | null;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const kindAccent =
    task.kind === "spot"
      ? "border-l-[3px] border-l-[var(--accent-spot)]"
      : task.kind === "ongoing"
        ? "border-l-[3px] border-l-[var(--accent-ongoing)]"
        : "border-l-[3px] border-l-[var(--accent-someday)]";

  return (
    <>
      {groupLabel ? (
        <tr className="bg-[var(--group-bg)]">
          <td
            colSpan={8}
            className="border-b border-[var(--grid-line)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)]"
          >
            묶음 · {groupLabel}
          </td>
        </tr>
      ) : null}
      <tr className={`group hover:bg-[var(--row-hover)] ${kindAccent}`}>
        <td className="border-b border-[var(--grid-line)] px-2 py-1.5 text-center align-middle">
          <Checkbox
            checked={false}
            onCheckedChange={() => onComplete(task.id)}
            aria-label={`${task.title} 완료`}
          />
        </td>
        <td className="border-b border-[var(--grid-line)] px-1 py-1 align-middle">
          <Input
            value={task.title}
            onChange={(e) => onUpdate(task.id, { title: e.target.value })}
            className="h-8 border-transparent bg-transparent px-2 shadow-none focus-visible:border-[var(--grid-line)] focus-visible:bg-white"
          />
        </td>
        <td className="border-b border-[var(--grid-line)] px-1 py-1 align-middle">
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
        <td className="border-b border-[var(--grid-line)] px-1 py-1 align-middle">
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
        <td className="border-b border-[var(--grid-line)] px-1 py-1 align-middle">
          <ScoreSelect
            value={task.urgency}
            onChange={(n) => onUpdate(task.id, { urgency: n })}
          />
        </td>
        <td className="border-b border-[var(--grid-line)] px-1 py-1 align-middle">
          <ScoreSelect
            value={task.importance}
            onChange={(n) => onUpdate(task.id, { importance: n })}
          />
        </td>
        <td className="border-b border-[var(--grid-line)] px-2 py-1.5 align-middle text-[12px] text-[var(--ink-muted)]">
          {SOURCE_LABEL[task.source]}
        </td>
        <td className="border-b border-[var(--grid-line)] px-1 py-1 align-middle">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => onDelete(task.id)}
            aria-label="삭제"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </td>
      </tr>
    </>
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
    <Select
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
    >
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
