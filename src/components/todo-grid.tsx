"use client";

import { useMemo, useState } from "react";
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
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";

interface TodoGridProps {
  tasks: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  hideCategory?: boolean;
  onAddItem?: () => void;
}

const KIND_META: Record<
  TaskKind,
  { title: string; hint: string; accent: string; chip: string }
> = {
  spot: {
    title: "오늘 · 스팟",
    hint: "당일 마무리",
    accent: "var(--accent-spot)",
    chip: "bg-[color-mix(in_oklch,var(--accent-spot)_14%,white)] text-[#8a5420]",
  },
  ongoing: {
    title: "진행 중 · 지속",
    hint: "목표기일까지",
    accent: "var(--accent-ongoing)",
    chip: "bg-[color-mix(in_oklch,var(--accent-ongoing)_12%,white)] text-[var(--brand)]",
  },
  someday: {
    title: "언젠가",
    hint: "시급·중요 순",
    accent: "var(--accent-someday)",
    chip: "bg-[color-mix(in_oklch,var(--accent-someday)_14%,white)] text-[#4a5a63]",
  },
};

function priorityLevel(task: Task): "high" | "mid" | "low" {
  const s = task.urgency * 10 + task.importance;
  if (s >= 45) return "high";
  if (s >= 30) return "mid";
  return "low";
}

function PriorityDots({ task }: { task: Task }) {
  const level = priorityLevel(task);
  const label =
    level === "high" ? "최우선" : level === "mid" ? "우선" : "보통";
  const color =
    level === "high"
      ? "bg-[var(--accent-spot)]"
      : level === "mid"
        ? "bg-[var(--accent-ongoing)]"
        : "bg-[var(--accent-someday)]";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink-muted)]"
      title={`시급 ${task.urgency} · 중요 ${task.importance}`}
    >
      <i className={`size-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export function TodoGrid({
  tasks,
  onUpdate,
  onComplete,
  onDelete,
  hideCategory,
  onAddItem,
}: TodoGridProps) {
  const sections = useMemo(() => {
    const order: TaskKind[] = ["spot", "ongoing", "someday"];
    return order
      .map((kind) => {
        const items = tasks.filter((t) => t.kind === kind);
        const groups: { key: string; items: Task[] }[] = [];
        for (const t of items) {
          const key = (t.groupKey || "기타").trim() || "기타";
          const last = groups[groups.length - 1];
          if (last && last.key === key) last.items.push(t);
          else groups.push({ key, items: [t] });
        }
        return { kind, items, groups };
      })
      .filter((s) => s.items.length > 0);
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--grid-line)] bg-[var(--sheet)] px-4 py-14 text-center">
        <p className="text-base font-semibold text-[var(--ink)]">
          이 틀에 할 일이 없습니다
        </p>
        <p className="max-w-sm text-sm text-[var(--ink-muted)]">
          「항목 추가」로 오늘 할 일을 적어 보세요. 스팟 → 지속 → 언젠가 순으로
          자동 정렬됩니다.
        </p>
        {onAddItem ? (
          <Button type="button" size="sm" onClick={onAddItem}>
            <Plus className="size-3.5" />
            항목 추가
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {sections.map((section) => {
        const meta = KIND_META[section.kind];
        return (
          <section key={section.kind} className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2 px-0.5">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: meta.accent }}
                />
                <h3 className="text-sm font-semibold text-[var(--ink)]">
                  {meta.title}
                </h3>
                <span className="text-[11px] text-[var(--ink-muted)]">
                  {meta.hint} · {section.items.length}건
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {section.groups.map((group) => (
                <div key={`${section.kind}-${group.key}`} className="space-y-2">
                  {group.items.length > 0 ? (
                    <p className="px-1 text-[11px] font-semibold tracking-wide text-[var(--ink-muted)]">
                      {group.key}
                    </p>
                  ) : null}
                  <ul className="space-y-2">
                    {group.items.map((task) => (
                      <TodoCard
                        key={task.id}
                        task={task}
                        chipClass={meta.chip}
                        accent={meta.accent}
                        hideCategory={hideCategory}
                        onUpdate={onUpdate}
                        onComplete={onComplete}
                        onDelete={onDelete}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TodoCard({
  task,
  chipClass,
  accent,
  hideCategory,
  onUpdate,
  onComplete,
  onDelete,
}: {
  task: Task;
  chipClass: string;
  accent: string;
  hideCategory?: boolean;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li
      className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet)] shadow-[0_1px_0_rgba(20,40,60,0.03)] transition-shadow hover:shadow-[0_2px_8px_rgba(20,40,60,0.06)]"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <div className="flex gap-3 px-3 py-3 sm:px-4">
        <div className="pt-1">
          <Checkbox
            checked={false}
            onCheckedChange={() => onComplete(task.id)}
            aria-label={`${task.title} 완료 → 한 일로 이동`}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Input
              value={task.title}
              onChange={(e) => onUpdate(task.id, { title: e.target.value })}
              className="h-9 flex-1 border-transparent bg-transparent px-0 text-base font-medium shadow-none focus-visible:border-[var(--grid-line)] focus-visible:bg-white focus-visible:px-2"
              aria-label="할 일 제목"
            />
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${chipClass}`}
              >
                {KIND_LABEL[task.kind]}
              </span>
              <PriorityDots task={task} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--ink-muted)]">
            {task.targetDate ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" />
                {task.targetDate}
              </span>
            ) : (
              <span>기한 없음</span>
            )}
            <span>
              시급 {task.urgency} · 중요 {task.importance}
            </span>
            {task.memo ? (
              <span className="max-w-full truncate text-[var(--ink)]/70">
                메모 · {task.memo}
              </span>
            ) : null}
          </div>

          {open ? (
            <div className="grid gap-2 rounded-lg bg-[var(--sheet-header)]/80 p-3 sm:grid-cols-2">
              <label className="space-y-1 text-[11px] text-[var(--ink-muted)]">
                메모
                <Input
                  value={task.memo}
                  placeholder="짧게 적어 두세요"
                  onChange={(e) => onUpdate(task.id, { memo: e.target.value })}
                  className="h-8 bg-white"
                />
              </label>
              <label className="space-y-1 text-[11px] text-[var(--ink-muted)]">
                유형
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
                  <SelectTrigger className="h-8 w-full bg-white">
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
              </label>
              <label className="space-y-1 text-[11px] text-[var(--ink-muted)]">
                목표기일
                <Input
                  type="date"
                  value={task.targetDate ?? ""}
                  disabled={task.kind === "someday"}
                  onChange={(e) =>
                    onUpdate(task.id, { targetDate: e.target.value || null })
                  }
                  className="h-8 bg-white disabled:opacity-40"
                />
              </label>
              {!hideCategory ? (
                <label className="space-y-1 text-[11px] text-[var(--ink-muted)]">
                  틀
                  <Select
                    value={task.category}
                    onValueChange={(v) =>
                      onUpdate(task.id, { category: v as TaskCategory })
                    }
                  >
                    <SelectTrigger className="h-8 w-full bg-white">
                      <SelectValue>
                        {CATEGORY_LABEL[task.category]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CATEGORY_LABEL) as TaskCategory[]).map(
                        (c) => (
                          <SelectItem key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
              <label className="space-y-1 text-[11px] text-[var(--ink-muted)]">
                시급 (1–5)
                <ScoreSelect
                  value={task.urgency}
                  onChange={(n) => onUpdate(task.id, { urgency: n })}
                />
              </label>
              <label className="space-y-1 text-[11px] text-[var(--ink-muted)]">
                중요 (1–5)
                <ScoreSelect
                  value={task.importance}
                  onChange={(n) => onUpdate(task.id, { importance: n })}
                />
              </label>
              <div className="flex items-end sm:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => onDelete(task.id)}
                >
                  <Trash2 className="size-3.5" />
                  삭제
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-0.5 shrink-0"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "편집 접기" : "자세히 편집"}
        >
          {open ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
      </div>
    </li>
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
      <SelectTrigger className="h-8 w-full bg-white">
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
