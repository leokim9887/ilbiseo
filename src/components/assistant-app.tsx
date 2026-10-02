"use client";

import { useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { TodoGrid } from "@/components/todo-grid";
import { CompletionLog } from "@/components/completion-log";
import { ChecklistPanel } from "@/components/checklist-panel";
import { CalendarPanel } from "@/components/calendar-panel";
import { DailyBriefingPanel } from "@/components/daily-briefing";
import { ExcelLinker } from "@/components/excel-linker";
import { MemoImport } from "@/components/memo-import";
import { OcrImport } from "@/components/ocr-import";
import { InstallHint } from "@/components/install-hint";
import { WelcomeBanner } from "@/components/welcome-banner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type TaskCategory,
} from "@/lib/types";
import { Loader2, Plus, RotateCcw } from "lucide-react";

export function AssistantApp() {
  const app = useAppState();
  const [category, setCategory] = useState<TaskCategory>("work");
  const [todoMode, setTodoMode] = useState<"todo" | "done">("todo");

  if (app.status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="size-6 animate-spin text-[var(--brand)]" />
        <p className="text-sm text-[var(--ink-muted)]">불러오는 중…</p>
      </div>
    );
  }

  if (app.status === "error") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <p className="text-lg font-semibold">데이터를 열 수 없습니다</p>
        <p className="text-sm text-destructive">{app.error}</p>
        <Button type="button" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </div>
    );
  }

  const active = app.activeTasks(category);
  const done = app.completedTasks(category);
  const checks = app.checklistsFor(category);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <InstallHint />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-7">
        <WelcomeBanner />

        <header className="animate-fade-up space-y-2">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--ink-muted)]">
            아버지용 · 이 기기 전용
          </p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--brand)] sm:text-5xl">
                일비서
              </p>
              <p className="mt-1 max-w-xl text-sm text-[var(--ink-muted)]">
                업무·개인·과제·팀원 틀로 할 일/한 일·체크리스트를 관리하고,
                구글 캘린더는 따로 봅니다. 매일 08:00 브리핑·PC 엑셀 갱신.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[12px] text-[var(--ink-muted)]">
              <span>할 일 {app.allActive.length}</span>
              <span>한 일 {app.allCompleted.length}</span>
              <span>캘린더 {app.calendarEvents.length}</span>
            </div>
          </div>
        </header>

        <ExcelLinker
          state={app.state}
          linked={app.excelLinked}
          status={app.excelStatus}
          onLinkedChange={app.setExcelLinked}
          onSync={app.forceExcelSync}
        />

        {app.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {app.error}
          </p>
        ) : null}

        <Tabs defaultValue="program" className="gap-4">
          <TabsList className="h-auto min-h-9 flex-wrap bg-[var(--sheet-header)]">
            <TabsTrigger value="program">프로그램 (4틀)</TabsTrigger>
            <TabsTrigger value="calendar">구글 캘린더</TabsTrigger>
            <TabsTrigger value="briefing">오늘 브리핑</TabsTrigger>
          </TabsList>

          <TabsContent value="program" className="animate-sheet-in space-y-4 outline-none">
            <div className="flex flex-wrap gap-2">
              {CATEGORY_ORDER.map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={category === c ? "default" : "outline"}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_LABEL[c]}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={todoMode === "todo" ? "secondary" : "ghost"}
                onClick={() => setTodoMode("todo")}
              >
                할 일 ({active.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={todoMode === "done" ? "secondary" : "ghost"}
                onClick={() => setTodoMode("done")}
              >
                한 일 ({done.length})
              </Button>
              <div className="mx-1 h-5 w-px bg-[var(--grid-line)]" />
              <Button
                type="button"
                size="sm"
                onClick={() => app.addTask({ category, kind: "spot" })}
              >
                <Plus className="size-3.5" />
                항목 추가
              </Button>
              <MemoImport
                category={category}
                onImport={app.addMany}
              />
              <OcrImport category={category} onImport={app.addMany} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto text-[var(--ink-muted)]"
                onClick={app.resetSamples}
              >
                <RotateCcw className="size-3.5" />
                샘플 다시 넣기
              </Button>
            </div>

            <p className="text-sm font-medium text-[var(--ink)]">
              {CATEGORY_LABEL[category]} ·{" "}
              {todoMode === "todo" ? "할 일" : "한 일"}
            </p>

            {todoMode === "todo" ? (
              <>
                <TodoGrid
                  tasks={active}
                  hideCategory
                  onUpdate={app.updateTask}
                  onComplete={app.completeTask}
                  onDelete={app.deleteTask}
                  onAddItem={() => app.addTask({ category, kind: "spot" })}
                />
                <p className="text-[11px] text-[var(--ink-muted)]">
                  위에서부터 오늘(스팟) → 지속 → 언젠가 · 비슷한 일은 묶음 ·
                  체크하면 한 일로 이동 · ▾ 으로 기한·시급·중요·메모 편집
                </p>
              </>
            ) : (
              <CompletionLog
                tasks={done}
                onRestore={app.restoreTask}
                onDelete={app.deleteTask}
              />
            )}

            <ChecklistPanel
              items={checks}
              category={category}
              onAdd={app.addChecklist}
              onToggle={app.toggleChecklist}
              onDelete={app.deleteChecklist}
            />
          </TabsContent>

          <TabsContent value="calendar" className="animate-sheet-in outline-none">
            <CalendarPanel
              events={app.calendarEvents}
              onReplace={(events) => app.replaceCalendar(events, "replace")}
              onAppend={(events) => app.replaceCalendar(events, "append")}
            />
          </TabsContent>

          <TabsContent value="briefing" className="animate-sheet-in outline-none">
            <DailyBriefingPanel
              tasks={app.state.tasks}
              checklists={app.state.checklists}
              calendarEvents={app.calendarEvents}
              onAfterExport={() => void app.forceExcelSync()}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
