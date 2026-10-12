"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { useDeviceSync } from "@/hooks/use-device-sync";
import { ExcelWorkbook } from "@/components/excel-workbook";
import { FamilyBanner } from "@/components/family-banner";
import { SideListSection } from "@/components/side-list-section";
import { CalendarPanel } from "@/components/calendar-panel";
import { DailyBriefingPanel } from "@/components/daily-briefing";
import { ExcelLinker } from "@/components/excel-linker";
import { DeviceSyncPanel } from "@/components/device-sync-panel";
import { InstallHint } from "@/components/install-hint";
import { WelcomeBanner } from "@/components/welcome-banner";
import { AppNav, type MainView } from "@/components/app-nav";
import { PanelShell } from "@/components/panel-shell";
import { Button } from "@/components/ui/button";
import {
  isAllFrame,
  isTaskCategory,
  type FrameId,
  type Task,
  type TaskCategory,
} from "@/lib/types";
import { Loader2, RotateCcw } from "lucide-react";

const AUTO_DONE_TITLE_LIMIT = 8;

/** Concise father-friendly alert after overdue → 한 일. */
function formatAutoDoneAlert(moved: Task[]): string {
  const n = moved.length;
  const lines = moved.slice(0, AUTO_DONE_TITLE_LIMIT).map((t, i) => {
    const title = (t.title || "(제목 없음)").trim() || "(제목 없음)";
    const short = title.length > 40 ? `${title.slice(0, 40)}…` : title;
    return `${i + 1}. ${short}`;
  });
  const extra =
    n > AUTO_DONE_TITLE_LIMIT
      ? `\n… 외 ${n - AUTO_DONE_TITLE_LIMIT}건`
      : "";
  return (
    `기한이 지난 할 일 ${n}건을 「한 일」로 옮겼습니다.\n\n` +
    lines.join("\n") +
    extra
  );
}

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
  /** Session: already-alerted auto-complete task ids (no spam). */
  const autoDoneAlertedRef = useRef<Set<string>>(new Set());
  const autoCompleteRef = useRef(app.autoCompleteOverdueTasks);
  autoCompleteRef.current = app.autoCompleteOverdueTasks;

  const runAutoCompleteOverdue = useCallback(() => {
    const moved = autoCompleteRef.current();
    if (moved.length === 0) return;
    const fresh = moved.filter((t) => !autoDoneAlertedRef.current.has(t.id));
    if (fresh.length === 0) return;
    for (const t of fresh) autoDoneAlertedRef.current.add(t.id);
    window.alert(formatAutoDoneAlert(fresh));
  }, []);

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

  // Overdue → 한 일 on load / tab visible / window (not only when opening a sheet)
  useEffect(() => {
    if (app.status !== "ready") return;
    runAutoCompleteOverdue();
    const onVisible = () => {
      if (document.visibilityState === "visible") runAutoCompleteOverdue();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", runAutoCompleteOverdue);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", runAutoCompleteOverdue);
    };
  }, [app.status, runAutoCompleteOverdue]);

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
    <div className="flex min-h-full flex-1 flex-col">
      <InstallHint />
      {sync.toast ? (
        <div
          className={`fixed left-1/2 top-3 z-50 w-[min(92vw,22rem)] -translate-x-1/2 rounded-xl border px-4 py-3 text-center text-[15px] shadow-md ${
            sync.toast.kind === "error"
              ? "border-destructive/30 bg-[var(--sheet)] text-destructive"
              : sync.toast.kind === "info"
                ? "border-[var(--grid-line)] bg-[var(--sheet)] text-[var(--ink)]"
                : "border-[var(--brand)]/30 bg-[var(--sheet)] text-[var(--brand)]"
          }`}
          role="status"
        >
          {sync.toast.text}
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-x-clip px-2.5 py-4 pb-[calc(6.25rem+env(safe-area-inset-bottom))] sm:gap-5 sm:px-6 sm:py-7 sm:pb-10">
        <FamilyBanner />
        <WelcomeBanner onStart={() => setView("todo")} />

        <header className="animate-fade-up space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold tracking-[0.08em] text-[var(--ink-muted)]">
                {sync.prefs.enabled
                  ? "아버지용 · PC·폰 동기화"
                  : "아버지용 · 설정에서 PC·폰 동기화"}
              </p>
              <h1 className="mt-0.5 font-[family-name:var(--font-display)] text-[2.15rem] font-bold leading-tight tracking-tight text-[var(--brand)] sm:text-5xl">
                일비서
              </h1>
            </div>
            <dl className="grid w-full grid-cols-3 gap-2 rounded-xl border border-[var(--grid-line)] bg-[var(--sheet)] px-3 py-2.5 text-center text-[15px] sm:flex sm:w-auto sm:gap-4 sm:px-4 sm:py-3">
              <div>
                <dt className="text-[13px] text-[var(--ink-muted)]">할 일</dt>
                <dd className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                  {app.allActive.length}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-[var(--ink-muted)]">한 일</dt>
                <dd className="text-lg font-semibold tabular-nums text-[var(--ink)]">
                  {app.allCompleted.length}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-[var(--ink-muted)]">일정</dt>
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
                mode={view === "done" ? "done" : "active"}
                onAdd={() => app.addSideItem("guideline")}
                onUpdate={(id, patch) =>
                  app.updateSideItem("guideline", id, patch)
                }
                onDelete={(id) => app.deleteSideItem("guideline", id)}
                onDeleteMany={(ids) =>
                  app.deleteSideItems("guideline", ids)
                }
                onCompleteMany={(ids) =>
                  app.completeSideItems("guideline", ids)
                }
              />
              <SideListSection
                kind="habit"
                items={app.habits}
                mode={view === "done" ? "done" : "active"}
                onAdd={() => app.addSideItem("habit")}
                onUpdate={(id, patch) =>
                  app.updateSideItem("habit", id, patch)
                }
                onDelete={(id) => app.deleteSideItem("habit", id)}
                onDeleteMany={(ids) => app.deleteSideItems("habit", ids)}
                onCompleteMany={(ids) =>
                  app.completeSideItems("habit", ids)
                }
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
                <DeviceSyncPanel
                  prefs={sync.prefs}
                  busy={sync.busy}
                  onPrefsChange={sync.writePrefs}
                  onSyncNow={() => void sync.syncNow()}
                  onEnabledPull={(code) =>
                    void sync.runPull({ silent: false, code })
                  }
                />
                <div className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/60 px-4 py-4">
                  <p className="text-[15px] font-semibold text-[var(--ink)]">
                    앱처럼 설치하기
                  </p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-[var(--ink-muted)]">
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
                  <p className="mt-2 text-[14px] text-[var(--ink-muted)]">
                    폰 사용 안내:{" "}
                    <a
                      className="font-medium text-[var(--brand)] underline underline-offset-2"
                      href="https://fleet-nitrogen-6wxfp18.vercel.app"
                      target="_blank"
                      rel="noreferrer"
                    >
                      fleet-nitrogen-6wxfp18.vercel.app
                    </a>
                    을 연 뒤 위 순서대로 홈 화면에 추가하세요.
                  </p>
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
