"use client";

import { useTasks } from "@/hooks/use-tasks";
import { TodoGrid } from "@/components/todo-grid";
import { CompletionLog } from "@/components/completion-log";
import { MemoImport } from "@/components/memo-import";
import { OcrImport } from "@/components/ocr-import";
import { CalendarImport } from "@/components/calendar-import";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InstallHint } from "@/components/install-hint";
import { WelcomeBanner } from "@/components/welcome-banner";
import { Plus, RotateCcw, Loader2 } from "lucide-react";

export function AssistantApp() {
  const {
    status,
    error,
    activeTasks,
    completedTasks,
    addTask,
    addMany,
    updateTask,
    completeTask,
    restoreTask,
    deleteTask,
    clearCompleted,
    resetSamples,
  } = useTasks();

  if (status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="size-6 animate-spin text-[var(--brand)]" />
        <p className="text-sm text-[var(--ink-muted)]">할 일을 불러오는 중…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <p className="text-lg font-semibold text-[var(--ink)]">
          데이터를 열 수 없습니다
        </p>
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </div>
    );
  }

  const spotCount = activeTasks.filter((t) => t.kind === "spot").length;
  const ongoingCount = activeTasks.filter((t) => t.kind === "ongoing").length;
  const somedayCount = activeTasks.filter((t) => t.kind === "someday").length;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <InstallHint />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-6 sm:px-6 sm:py-8">
      <WelcomeBanner />
      <header className="animate-fade-up space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--ink-muted)] uppercase">
              아버지용 · 이 기기 전용
            </p>
            <p className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[var(--brand)] sm:text-5xl">
              일비서
            </p>
            <p className="mt-1 max-w-xl text-sm text-[var(--ink-muted)] sm:text-base">
              헤드헌팅 할 일·일정 개인 비서 — 오늘 스팟부터, 목표일 지속,
              언젠가까지 자동 정렬
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px] text-[var(--ink-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-[var(--accent-spot)]" />
              스팟 {spotCount}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-[var(--accent-ongoing)]" />
              지속 {ongoingCount}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-[var(--accent-someday)]" />
              언젠가 {somedayCount}
            </span>
          </div>
        </div>
      </header>

      <section className="animate-fade-up-delay flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => addTask()}>
            <Plus className="size-3.5" />
            행 추가
          </Button>
          <MemoImport onImport={addMany} />
          <OcrImport onImport={addMany} />
          <CalendarImport onImport={addMany} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-[var(--ink-muted)]"
            onClick={resetSamples}
          >
            <RotateCcw className="size-3.5" />
            샘플 다시 넣기
          </Button>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Tabs defaultValue="todo" className="gap-4">
          <TabsList className="h-9 bg-[var(--sheet-header)]">
            <TabsTrigger value="todo">TO DO 목록</TabsTrigger>
            <TabsTrigger value="done">
              완료 기록 ({completedTasks.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="todo" className="animate-sheet-in outline-none">
            <TodoGrid
              tasks={activeTasks}
              onUpdate={updateTask}
              onComplete={completeTask}
              onDelete={deleteTask}
            />
            <p className="mt-2 text-[11px] text-[var(--ink-muted)]">
              정렬: 스팟(당일) → 지속(목표기일) → 언젠가(시급·중요) · 유사
              할일은 묶음으로 표시 · 브라우저에 자동 저장
            </p>
          </TabsContent>
          <TabsContent value="done" className="animate-sheet-in outline-none">
            <CompletionLog
              tasks={completedTasks}
              onRestore={restoreTask}
              onDelete={deleteTask}
              onClearAll={clearCompleted}
            />
          </TabsContent>
        </Tabs>
      </section>
      </div>
    </div>
  );
}
