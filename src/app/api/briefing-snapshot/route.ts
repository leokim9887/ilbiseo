import { NextResponse } from "next/server";
import {
  saveBriefingSnapshot,
  snapshotStoreMode,
  type BriefingSnapshot,
} from "@/lib/briefing-store";
import type { CalendarEvent, SideListItem, Task } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/briefing-snapshot
 * Client syncs latest localStorage state so cron can send at 08:00 KST.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<BriefingSnapshot>;
    const snapshot: BriefingSnapshot = {
      tasks: Array.isArray(body.tasks) ? (body.tasks as Task[]) : [],
      calendarEvents: Array.isArray(body.calendarEvents)
        ? (body.calendarEvents as CalendarEvent[])
        : [],
      guidelines: Array.isArray(body.guidelines)
        ? (body.guidelines as SideListItem[])
        : [],
      habits: Array.isArray(body.habits) ? (body.habits as SideListItem[]) : [],
      workEmail: String(body.workEmail ?? "").trim(),
      dailyEmailEnabled: Boolean(body.dailyEmailEnabled),
      attachXlsx: body.attachXlsx !== false,
      updatedAt: new Date().toISOString(),
    };

    const result = await saveBriefingSnapshot(snapshot);
    return NextResponse.json({
      ok: result.ok,
      store: result.store,
      message: result.message,
      mode: snapshotStoreMode(),
      updatedAt: snapshot.updatedAt,
      dailyEmailEnabled: snapshot.dailyEmailEnabled,
      workEmailSet: Boolean(snapshot.workEmail),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "스냅샷 저장 실패",
      },
      { status: 400 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/briefing-snapshot",
    storeMode: snapshotStoreMode(),
    note: "POST로 할 일·캘린더·지침·습관·이메일 설정을 동기화합니다.",
  });
}
