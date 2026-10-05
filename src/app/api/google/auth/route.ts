import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  buildAuthUrl,
  cookieOptions,
  GCAL_STATE_COOKIE,
  isGoogleConfigured,
} from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google OAuth 환경 변수가 없습니다. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI를 설정하세요.",
      },
      { status: 503 },
    );
  }
  const state = randomBytes(16).toString("hex");
  const url = buildAuthUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set(GCAL_STATE_COOKIE, state, {
    ...cookieOptions,
    maxAge: 60 * 10,
  });
  return res;
}
