"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { useDeviceSync } from "@/hooks/use-device-sync";
import { ExcelWorkbook } from "@/components/excel-workbook";
import { FamilyBanner } from "@/components/family-banner";
import { SideListSection } from "@/components/side-list-section";
import { CalendarPanel } from "@/components/calendar-panel";
import { DailyBriefingPanel } from "@/components/daily-briefing";
import { DailyCheerOverlay } from "@/components/daily-cheer-overlay";
import { ExcelLinker } from "@/components/excel-linker";
import { DeviceSyncPanel } from "@/components/device-sync-panel";
import { InstallHint } from "@/components/install-hint";
import { WelcomeBanner } from "@/components/welcome-banner";
import { AppNav, type MainView } from "@/components/app-nav";
import { PanelShell } from "@/components/panel-shell";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import {
  isAllFrame,
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
  const sync = useDeviceSync({
    ready: app.status === "ready",
    state: app.state,
    localUpdatedAt: app.localUpdatedAt,
    persistEpoch: app.persistEpoch,
    skipRemotePushRef: app.skipRemotePushRef,
    hydrateFromRemote: app.hydrateFromRemote,
  });
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
        text: "연결되었습니다. 일정을 불러오는 중…",
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

  const hardReloadCountRef = useRef(0);
  const handlePullRefresh = useCallback(async () => {
    app.reloadFromStorage();
    if (sync.prefs.enabled && sync.prefs.code) {
      try {
        await sync.syncNow();
      } catch {
        /* soft path continues */
      }
    }
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      void reg?.update();
    } catch {
      /* ignore */
    }
    // Every 4th pull: hard reload resources (cache-bust banners / JS)
    hardReloadCountRef.current += 1;
    if (hardReloadCountRef.current % 4 === 0) {
      return true;
    }
    return false;
  }, [app, sync]);

  const { pullPx, refreshing, threshold } = usePullToRefresh({
    onRefresh: handlePullRefresh,
  });

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
        <p className="text-lg font-semibold">불러오지 못했습니다</p>
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
  const active = isAllFrame(frame)
    ? app.activeTasks()
    : taskFrame
      ? app.activeTasks(taskFrame)
      : [];
  const done = isAllFrame(frame)
    ? app.completedTasks()
    : taskFrame
      ? app.completedTasks(taskFrame)
      : [];
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
    <div className="flex min-h-dvh flex-1 flex-col">
      <DailyCheerOverlay />
      <PullToRefreshIndicator
        pullPx={pullPx}
        refreshing={refreshing}
        threshold={threshold}
      />
      <InstallHint />
      {sync.toast ? (
        <div
          data-status-toast-root
          className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4 max-sm:top-[max(0.85rem,env(safe-area-inset-top))] max-sm:px-[max(1rem,env(safe-area-inset-left))] max-sm:pr-[max(1rem,env(safe-area-inset-right))]"
        >
          <div
            data-status-chip
            className={`pointer-events-auto w-full max-w-[22rem] rounded-xl border px-5 py-3.5 text-center text-[15px] shadow-md max-sm:border-transparent max-sm:bg-[var(--sheet)]/95 ${
              sync.toast.kind === "error"
                ? "border-destructive/30 bg-[var(--sheet)] text-destructive"
                : sync.toast.kind === "info"
                  ? "border-[var(--grid-line)] bg-[var(--sheet)] text-[var(--ink)]"
                  : "border-[var(--toss-blue)]/30 bg-[var(--sheet)] text-[var(--toss-blue)]"
            }`}
            role="status"
          >
            {sync.toast.text}
          </div>
        </div>
      ) : null}
      {/* Fullscreen-first shell: fill viewport width/height; wide screens use near-full width */}
      <div className="mx-auto flex w-full max-w-none flex-1 flex-col gap-3 overflow-x-clip px-2 pb-[calc(6.25rem+env(safe-area-inset-bottom))] pt-2 max-sm:gap-2.5 sm:gap-3 sm:px-4 sm:pb-6 sm:pt-3 md:px-5 lg:px-6 xl:max-w-[100rem] 2xl:max-w-[110rem]">
        <header className="shrink-0">
          <FamilyBanner
            activeCount={app.allActive.length}
            doneCount={app.allCompleted.length}
            calendarCount={app.calendarEvents.length}
          />
        </header>
        <WelcomeBanner onStart={() => setView("todo")} />

        <div className="shrink-0 sm:sticky sm:top-0 sm:z-30 sm:-mx-1 sm:bg-background/85 sm:px-1 sm:py-1.5 sm:backdrop-blur-md">
          <AppNav
            value={view}
            onChange={handleViewChange}
            counts={{
              todo: app.allActive.length,
              done: app.allCompleted.length,
              calendar: app.calendarEvents.length,
            }}
          />
        </div>

        {app.error ? (
          <p
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {app.error}
          </p>
        ) : null}

        <div
          className="animate-sheet-in flex min-h-0 flex-1 flex-col"
          key={workbookOpen ? "wb" : view}
        >
          {workbookOpen ? (
            <div className="space-y-3">
              <ExcelWorkbook
                sheet={view === "done" ? "done" : "todo"}
                frame={frame}
                onFrameChange={handleFrameChange}
                activeTasks={active}
                doneTasks={done}
                allActiveTasks={app.allActive}
                allTasksForImport={[...app.allActive, ...app.allCompleted]}
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
                onReplaceCategory={app.replaceCategoryTasks}
                onReplaceByCategories={app.replaceByTaskCategories}
                onTodoDelta={app.applyTodoDelta}
                onImportSide={app.addManySideItems}
                onReplaceSide={app.replaceSideItems}
                onSideDelta={app.applySideDelta}
                guidelines={app.guidelines}
                habits={app.habits}
              />
              {/* PC: 지침 | 습관 통일 영역 · 할 일/한 일 탭 동일 · 완료 없음 */}
              <div
                className="grid w-full grid-cols-1 gap-2.5 lg:grid-cols-2 lg:items-start lg:gap-3"
                data-side-lists-pair
                data-side-lists-unified="1"
              >
                <SideListSection
                  kind="guideline"
                  items={app.guidelines}
                  onAdd={() => app.addSideItem("guideline")}
                  onUpdate={(id, patch) =>
                    app.updateSideItem("guideline", id, patch)
                  }
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
                  onDelete={(id) => app.deleteSideItem("habit", id)}
                  onDeleteMany={(ids) => app.deleteSideItems("habit", ids)}
                />
              </div>
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
            />
          ) : null}

          {view === "settings" ? (
            <PanelShell title="설정">
              <div className="space-y-5">
                <ThemeToggle />
                <DeviceSyncPanel
                  prefs={sync.prefs}
                  busy={sync.busy}
                  onPrefsChange={sync.writePrefs}
                  onSyncNow={() => void sync.syncNow()}
                  onEnabledPull={(code) =>
                    void sync.runPull({ code })
                  }
                />
                <div className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/60 px-4 py-4">
                  <p className="text-[15px] font-semibold text-[var(--ink)]">
                    앱처럼 설치하기
                  </p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-[var(--ink-muted)]">
                    <li>
                      <strong>Windows/Mac</strong>: 메뉴 → 앱 설치
                    </li>
                    <li>
                      <strong>안드로이드</strong>: 메뉴 → 홈 화면에 추가
                    </li>
                    <li>
                      <strong>아이폰</strong>: 공유 → 홈 화면에 추가
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
                  <p className="text-[15px] font-semibold text-[var(--ink)]">
                    초기화
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="mt-3 min-h-11"
                    onClick={app.clearAllData}
                  >
                    <RotateCcw className="size-4" />
                    모두 지우기
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
