import { NextRequest, NextResponse } from "next/server";
import { fetchUpcomingGoogleEvents } from "@/lib/google-oauth";
import { ensureAccessToken, writeTokenCookie } from "@/lib/google-session";

export const runtime = "nodejs";
/** Wide calendar sync can take longer than the default serverless budget. */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // Default: full calendar (~10y past → ~10y ahead). Optional ?days=N for narrow sync.
  const daysParam = sp.get("days");
  const fullParam = sp.get("full");
  const wantFull =
    fullParam === "1" ||
    fullParam === "true" ||
    daysParam == null ||
    daysParam === "" ||
    daysParam === "all";

  const ensured = await ensureAccessToken();
  if ("error" in ensured) {
    return NextResponse.json(
      { error: ensured.error },
      { status: ensured.status },
    );
  }

  try {
    const events = await fetchUpcomingGoogleEvents(
      ensured.token,
      wantFull
        ? { full: true }
        : {
            full: false,
            daysAhead: Math.min(
              3650,
              Math.max(1, Number(daysParam) || 14),
            ),
          },
    );
    const json = NextResponse.json({
      ok: true,
      email: ensured.bundle.email ?? null,
      mode: wantFull ? "full" : "days",
      count: events.length,
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
    const msg = e instanceof Error ? e.message : "일정 불러오기 실패";
    const clean = /<\s*!doctype|<\s*html|Error 404 \(Not Found\)/i.test(msg)
      ? "Google 일정을 불러오지 못했습니다. 연결을 다시 하거나 Calendar API 설정을 확인하세요."
      : msg;
    return NextResponse.json({ error: clean }, { status: 502 });
  }
}
