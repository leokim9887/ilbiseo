"use client";

import { useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { ExcelWorkbook } from "@/components/excel-workbook";
import { CalendarPanel } from "@/components/calendar-panel";
import { DailyBriefingPanel } from "@/components/daily-briefing";
import { ExcelLinker } from "@/components/excel-linker";
import { InstallHint } from "@/components/install-hint";
import { WelcomeBanner } from "@/components/welcome-banner";
import { AppNav, type MainView } from "@/components/app-nav";
import { PanelShell } from "@/components/panel-shell";
import { Button } from "@/components/ui/button";
import { type TaskCategory } from "@/lib/types";
import { Loader2, RotateCcw } from "lucide-react";

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
  const workbookOpen = view === "todo" || view === "done";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <InstallHint />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-3 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7 sm:pb-10">
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
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--ink-muted)]">
                할 일·한 일은 엑셀 장부처럼 쓰고, 캘린더는 따로, 매일 08:00
                브리핑과 PC 파일 연결까지.
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
          value={view === "done" ? "done" : view === "todo" ? "todo" : view}
          onChange={setView}
          counts={{
            todo: app.allActive.length,
            done: app.allCompleted.length,
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

        <div className="animate-sheet-in" key={workbookOpen ? "wb" : view}>
          {workbookOpen ? (
            <ExcelWorkbook
              sheet={view === "done" ? "done" : "todo"}
              onSheetChange={(s) => setView(s === "done" ? "done" : "todo")}
              category={category}
              onCategoryChange={setCategory}
              activeTasks={active}
              doneTasks={done}
              onUpdate={app.updateTask}
              onComplete={app.completeTask}
              onRestore={app.restoreTask}
              onDelete={app.deleteTask}
              onAdd={() => app.addTask({ category, kind: "spot" })}
              onImport={app.addMany}
            />
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
                    할 일·한 일은 이 브라우저(localStorage)에 저장됩니다. 장부
                    UI와 PC xlsx 시트가 같은 구조입니다.
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
              </div>
            </PanelShell>
          ) : null}
        </div>
      </div>
    </div>
  );
}
