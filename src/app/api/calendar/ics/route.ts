import { NextRequest, NextResponse } from "next/server";
import {
  icsErrorCode,
  icsErrorMessage,
  importIcsFromInput,
  normalizeCalendarFeedUrl,
  parseIcsToEvents,
} from "@/lib/ics";

export const runtime = "nodejs";

function statusForCode(code: string): number {
  switch (code) {
    case "invalid_url":
    case "invalid_ics":
      return 400;
    case "no_events":
      return 422;
    case "fetch_failed":
    case "empty_body":
      return 502;
    default:
      return 500;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url?.trim()) {
    return NextResponse.json(
      {
        error: "url 쿼리가 필요합니다. 예: /api/calendar/ics?url=https://…/basic.ics",
        code: "invalid_url",
      },
      { status: 400 },
    );
  }
  try {
    normalizeCalendarFeedUrl(url);
    const events = await importIcsFromInput(url.trim());
    return NextResponse.json({
      ok: true,
      count: events.length,
      events,
      via: "url",
    });
  } catch (e) {
    const code = icsErrorCode(e);
    return NextResponse.json(
      { error: icsErrorMessage(e), code },
      { status: statusForCode(code) },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string; text?: string };
    const url = body.url?.trim();
    const text = body.text?.trim();

    if (url) {
      const events = await importIcsFromInput(url);
      return NextResponse.json({
        ok: true,
        count: events.length,
        events,
        via: "url",
      });
    }
    if (text) {
      const events = parseIcsToEvents(text);
      return NextResponse.json({
        ok: true,
        count: events.length,
        events,
        via: "text",
      });
    }
    return NextResponse.json(
      {
        error: "url 또는 text 중 하나를 보내 주세요.",
        code: "invalid_ics",
      },
      { status: 400 },
    );
  } catch (e) {
    const code = icsErrorCode(e);
    return NextResponse.json(
      { error: icsErrorMessage(e), code },
      { status: statusForCode(code) },
    );
  }
}
