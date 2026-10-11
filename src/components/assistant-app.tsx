"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { ExcelWorkbook } from "@/components/excel-workbook";
import { SideListSection } from "@/components/side-list-section";
import { CalendarPanel } from "@/components/calendar-panel";
import { DailyBriefingPanel } from "@/components/daily-briefing";
import { ExcelLinker } from "@/components/excel-linker";
import { InstallHint } from "@/components/install-hint";
import { WelcomeBanner } from "@/components/welcome-banner";
import { AppNav, type MainView } from "@/components/app-nav";
import { PanelShell } from "@/components/panel-shell";
import { Button } from "@/components/ui/button";
import {
  isTaskCategory,
  type FrameId,
  type TaskCategory,
} from "@/lib/types";
import { Loader2, RotateCcw } from "lucide-react";

function readViewFromUrl(): MainView | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("view");
  if (
    v === "todo" ||
    v === "done" ||
    v === "calendar" ||
    v === "briefing" ||
    v === "settings"
  ) {
    return v;
  }
  return null;
}

export function AssistantApp() {
  const app = useAppState();
  const [frame, setFrame] = useState<FrameId>("work");
  const [view, setView] = useState<MainView>("todo");
  const [gcalBanner, setGcalBanner] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const fromUrl = readViewFromUrl();
    if (fromUrl) setView(fromUrl);
    const params = new URLSearchParams(window.location.search);
    const gcal = params.get("gcal");
    if (gcal === "connected") {
      setGcalBanner({
        kind: "ok",
        text: "Google 캘린더에 연결되었습니다. 일정을 불러오는 중입니다.",
      });
    } else if (gcal === "error") {
      setGcalBanner({
        kind: "error",
        text: params.get("msg") || "Google 연결에 실패했습니다.",
      });
    }
    if (fromUrl || gcal) {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      url.searchParams.delete("gcal");
      url.searchParams.delete("msg");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);

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

  const taskFrame: TaskCategory | undefined = isTaskCategory(frame)
    ? frame
    : undefined;
  const active = taskFrame ? app.activeTasks(taskFrame) : [];
  const done = taskFrame ? app.completedTasks(taskFrame) : [];
  const workbookOpen = view === "todo" || view === "done";

  const handleFrameChange = (f: FrameId) => {
    setFrame(f);
    if (f === "gcal" && view === "done") setView("todo");
  };

  const handleViewChange = (v: MainView) => {
    if (v === "done" && frame === "gcal") setFrame("work");
    setView(v);
  };

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
          onChange={handleViewChange}
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
            <div className="space-y-4">
              <ExcelWorkbook
                sheet={view === "done" ? "done" : "todo"}
                onSheetChange={(s) => setView(s === "done" ? "done" : "todo")}
                frame={frame}
                onFrameChange={handleFrameChange}
                activeTasks={active}
                doneTasks={done}
                allActiveTasks={app.allActive}
                calendarEvents={app.calendarEvents}
                onUpdate={app.updateTask}
                onComplete={app.completeTask}
                onCompleteMany={app.completeTasks}
                onRestore={app.restoreTask}
                onDelete={app.deleteTask}
                onDeleteMany={app.deleteTasks}
                onRestoreMany={app.restoreTasks}
                onAdd={() =>
                  app.addTask({
                    category: isTaskCategory(frame) ? frame : "work",
                    kind: "spot",
                  })
                }
                onImport={app.addMany}
              />
              <SideListSection
                kind="guideline"
                items={app.guidelines}
                onAdd={() => app.addSideItem("guideline")}
                onUpdate={(id, patch) =>
                  app.updateSideItem("guideline", id, patch)
                }
                onToggle={(id) => app.toggleSideItem("guideline", id)}
                onDelete={(id) => app.deleteSideItem("guideline", id)}
                onDeleteMany={(ids) =>
                  app.deleteSideItems("guideline", ids)
                }
              />
              <SideListSection
                kind="habit"
                items={app.habits}
                onAdd={() => app.addSideItem("habit")}
                onUpdate={(id, patch) =>
                  app.updateSideItem("habit", id, patch)
                }
                onToggle={(id) => app.toggleSideItem("habit", id)}
                onDelete={(id) => app.deleteSideItem("habit", id)}
                onDeleteMany={(ids) => app.deleteSideItems("habit", ids)}
              />
            </div>
          ) : null}

          {view === "calendar" ? (
            <CalendarPanel
              events={app.calendarEvents}
              onReplace={(events) => app.replaceCalendar(events, "replace")}
              onAppend={(events) => app.replaceCalendar(events, "append")}
              banner={gcalBanner}
            />
          ) : null}

          {view === "briefing" ? (
            <DailyBriefingPanel
              tasks={app.state.tasks}
              calendarEvents={app.calendarEvents}
              guidelines={app.guidelines}
              habits={app.habits}
              onAfterExport={() => void app.forceExcelSync()}
            />
          ) : null}

          {view === "settings" ? (
            <PanelShell title="설정 · 엑셀">
              <div className="space-y-5">
                <div className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/60 px-4 py-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    앱처럼 설치하기
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--ink-muted)]">
                    <li>
                      <strong>Windows/Mac</strong>: Chrome·Edge → 주소창 설치
                      아이콘 또는 메뉴 → 앱 설치
                    </li>
                    <li>
                      <strong>안드로이드</strong>: Chrome 메뉴(⋮) → 앱 설치 /
                      홈 화면에 추가
                    </li>
                    <li>
                      <strong>아이폰</strong>: Safari → 공유 → 홈 화면에 추가
                    </li>
                  </ul>
                </div>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="mt-3 min-h-11"
                    onClick={app.clearAllData}
                  >
                    <RotateCcw className="size-4" />
                    데이터 비우기
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
