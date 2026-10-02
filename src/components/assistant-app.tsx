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
import { AppNav, type MainView } from "@/components/app-nav";
import { PanelShell } from "@/components/panel-shell";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type TaskCategory,
} from "@/lib/types";
import { Loader2, Plus, RotateCcw } from "lucide-react";

export function AssistantApp() {
  const app = useAppState();
  const [category, setCategory] = useState<TaskCategory>("work");
  const [view, setView] = useState<MainView>("todo");

  if (app.status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="size-7 animate-spin text-[var(--brand)]" />
        <p className="text-base text-[var(--ink-muted)]">불러오는 중…</p>
      </div>
    );
  }

  if (app.status === "error") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <p className="text-lg font-semibold">데이터를 열 수 없습니다</p>
        <p className="text-sm text-destructive">{app.error}</p>
        <Button type="button" size="lg" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </div>
    );
  }

  const active = app.activeTasks(category);
  const done = app.completedTasks(category);
  const checks = app.checklistsFor(category);
  const showCategory =
    view === "todo" || view === "done" || view === "checklist";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <InstallHint />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7 sm:pb-10">
        <WelcomeBanner onStart={() => setView("todo")} />

        <header className="animate-fade-up space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.1em] text-[var(--ink-muted)]">
                아버지용 · 이 기기 전용
              </p>
              <h1 className="mt-0.5 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[var(--brand)] sm:text-5xl">
                일비서
              </h1>
              <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-[var(--ink-muted)]">
                할 일·한 일·체크리스트를 네 틀로 보고, 캘린더는 따로, 매일 08:00
                브리핑과 PC 엑셀까지.
              </p>
            </div>
            <dl className="flex gap-4 rounded-xl border border-[var(--grid-line)] bg-[var(--sheet)] px-4 py-2.5 text-center text-sm">
              <div>
                <dt className="text-[11px] text-[var(--ink-muted)]">할 일</dt>
                <dd className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                  {app.allActive.length}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--ink-muted)]">한 일</dt>
                <dd className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                  {app.allCompleted.length}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--ink-muted)]">일정</dt>
                <dd className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                  {app.calendarEvents.length}
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <AppNav
          value={view}
          onChange={setView}
          counts={{
            todo: app.allActive.length,
            done: app.allCompleted.length,
            checklist: app.state.checklists.filter((c) => !c.checked).length,
            calendar: app.calendarEvents.length,
          }}
        />

        {app.error ? (
          <p
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {app.error}
          </p>
        ) : null}

        {showCategory ? (
          <div className="animate-sheet-in space-y-2">
            <p className="text-[11px] font-semibold tracking-wide text-[var(--ink-muted)]">
              네 틀 고르기
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CATEGORY_ORDER.map((c) => {
                const selected = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`min-h-12 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      selected
                        ? "border-[var(--brand)] bg-[var(--group-bg)] text-[var(--brand)]"
                        : "border-[var(--grid-line)] bg-[var(--sheet)] text-[var(--ink)] hover:bg-[var(--row-hover)]"
                    }`}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="animate-sheet-in" key={view}>
          {view === "todo" ? (
            <PanelShell
              title={`${CATEGORY_LABEL[category]} · 할 일`}
              description="오늘·스팟이 위에, 비슷한 일은 묶입니다. 체크하면 한 일로 갑니다."
              actions={
                <>
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-11"
                    onClick={() => app.addTask({ category, kind: "spot" })}
                  >
                    <Plus className="size-4" />
                    항목 추가
                  </Button>
                  <MemoImport category={category} onImport={app.addMany} />
                  <OcrImport category={category} onImport={app.addMany} />
                </>
              }
            >
              <TodoGrid
                tasks={active}
                hideCategory
                onUpdate={app.updateTask}
                onComplete={app.completeTask}
                onDelete={app.deleteTask}
                onAddItem={() => app.addTask({ category, kind: "spot" })}
              />
              <p className="mt-4 text-[12px] text-[var(--ink-muted)]">
                ▾ 으로 기한·시급·중요·메모를 고칩니다.
              </p>
            </PanelShell>
          ) : null}

          {view === "done" ? (
            <PanelShell
              title={`${CATEGORY_LABEL[category]} · 한 일`}
              description="끝낸 일 기록입니다. 필요하면 복원하세요."
            >
              <CompletionLog
                tasks={done}
                onRestore={app.restoreTask}
                onDelete={app.deleteTask}
              />
            </PanelShell>
          ) : null}

          {view === "checklist" ? (
            <PanelShell
              title={`${CATEGORY_LABEL[category]} · 체크리스트`}
              description="짧게 체크만 하면 되는 항목입니다. 할 일과 별도로 둡니다."
            >
              <ChecklistPanel
                items={checks}
                category={category}
                onAdd={app.addChecklist}
                onToggle={app.toggleChecklist}
                onDelete={app.deleteChecklist}
                bare
              />
            </PanelShell>
          ) : null}

          {view === "calendar" ? (
            <CalendarPanel
              events={app.calendarEvents}
              onReplace={(events) => app.replaceCalendar(events, "replace")}
              onAppend={(events) => app.replaceCalendar(events, "append")}
            />
          ) : null}

          {view === "briefing" ? (
            <DailyBriefingPanel
              tasks={app.state.tasks}
              checklists={app.state.checklists}
              calendarEvents={app.calendarEvents}
              onAfterExport={() => void app.forceExcelSync()}
            />
          ) : null}

          {view === "settings" ? (
            <PanelShell
              title="설정 · 엑셀"
              description="PC 엑셀 연결, 샘플 데이터, 이 기기 저장 안내입니다. 브리핑 메일 주소는 「오늘 브리핑」에서도 바꿀 수 있습니다."
            >
              <div className="space-y-5">
                <ExcelLinker
                  state={app.state}
                  linked={app.excelLinked}
                  status={app.excelStatus}
                  onLinkedChange={app.setExcelLinked}
                  onSync={app.forceExcelSync}
                />
                <div className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/60 px-4 py-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    데이터
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">
                    할 일·한 일·체크리스트는 이 브라우저(localStorage)에
                    저장됩니다. 샘플을 다시 넣어도 기존 구조는 그대로입니다.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="mt-3 min-h-11"
                    onClick={app.resetSamples}
                  >
                    <RotateCcw className="size-4" />
                    샘플 다시 넣기
                  </Button>
                </div>
                <p className="text-sm text-[var(--ink-muted)]">
                  PWA로 홈 화면에 두면 앱처럼 열립니다. 엑셀 자동 갱신은 아버지
                  PC Chrome에서 「엑셀 파일 연결」할 때만 됩니다.
                </p>
              </div>
            </PanelShell>
          ) : null}
        </div>
      </div>
    </div>
  );
}
