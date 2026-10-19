import { NextRequest, NextResponse } from "next/server";
import {
  fetchUpcomingGoogleEvents,
  GOOGLE_RECONNECT_MESSAGE,
  isGoogleTokenRevokedError,
} from "@/lib/google-oauth";
import {
  clearTokenCookie,
  ensureAccessToken,
  writeTokenCookie,
} from "@/lib/google-session";

export const runtime = "nodejs";
/** Wide calendar sync can take longer than the default serverless budget. */
export const maxDuration = 60;

function authFailureJson(error: string) {
  const res = NextResponse.json(
    { error, needsReconnect: true },
    { status: 401 },
  );
  return res;
}

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

  const fetchOpts = wantFull
    ? ({ full: true } as const)
    : {
        full: false as const,
        daysAhead: Math.min(3650, Math.max(1, Number(daysParam) || 14)),
      };

  let ensured = await ensureAccessToken();
  if ("error" in ensured) {
    const res = NextResponse.json(
      {
        error: ensured.error,
        needsReconnect: ensured.needsReconnect,
      },
      { status: ensured.status },
    );
    if (ensured.clearCookie) {
      await clearTokenCookie(res);
    }
    return res;
  }

  const tryFetch = (token: string) =>
    fetchUpcomingGoogleEvents(token, fetchOpts);

  try {
    let events;
    try {
      events = await tryFetch(ensured.token);
    } catch (first) {
      const firstMsg = first instanceof Error ? first.message : "";
      // Access token looked fresh locally but Google rejected it — force refresh once.
      if (isGoogleTokenRevokedError(firstMsg) || /401|인증|만료|credentials/i.test(firstMsg)) {
        const refreshed = await ensureAccessToken(undefined, {
          forceRefresh: true,
        });
        if ("error" in refreshed) {
          const res = authFailureJson(refreshed.error);
          if (refreshed.clearCookie) await clearTokenCookie(res);
          return res;
        }
        ensured = refreshed;
        events = await tryFetch(ensured.token);
      } else {
        throw first;
      }
    }

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
    if (isGoogleTokenRevokedError(msg)) {
      const res = authFailureJson(GOOGLE_RECONNECT_MESSAGE);
      await clearTokenCookie(res);
      return res;
    }
    const clean = /<\s*!doctype|<\s*html|Error 404 \(Not Found\)/i.test(msg)
      ? "Google 일정을 불러오지 못했습니다. 연결을 다시 하거나 Calendar API 설정을 확인하세요."
      : /[A-Za-z]{8,}/.test(msg) && !/[가-힣]/.test(msg)
        ? "Google 일정을 불러오지 못했습니다. 「새로고침」하거나 다시 연결해 주세요."
        : msg;
    return NextResponse.json({ error: clean }, { status: 502 });
  }
}
