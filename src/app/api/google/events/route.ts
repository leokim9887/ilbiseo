import { NextRequest, NextResponse } from "next/server";
import { fetchUpcomingGoogleEvents } from "@/lib/google-oauth";
import { ensureAccessToken, writeTokenCookie } from "@/lib/google-session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const days = Math.min(
    60,
    Math.max(1, Number(req.nextUrl.searchParams.get("days") || 14) || 14),
  );

  const ensured = await ensureAccessToken();
  if ("error" in ensured) {
    return NextResponse.json(
      { error: ensured.error },
      { status: ensured.status },
    );
  }

  try {
    const events = await fetchUpcomingGoogleEvents(ensured.token, days);
    const json = NextResponse.json({
      ok: true,
      email: ensured.bundle.email ?? null,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        notes: e.notes,
        calendarName: e.calendarName,
        source: "google" as const,
      })),
    });
    await writeTokenCookie(json, ensured.bundle);
    return json;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "일정 불러오기 실패" },
      { status: 502 },
    );
  }
}
