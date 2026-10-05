import { NextRequest, NextResponse } from "next/server";
import {
  cookieOptions,
  exchangeCode,
  fetchGoogleEmail,
  GCAL_STATE_COOKIE,
  isGoogleConfigured,
} from "@/lib/google-oauth";
import { writeTokenCookie } from "@/lib/google-session";

export const runtime = "nodejs";

function appOrigin(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const fail = (msg: string) =>
    NextResponse.redirect(
      `${origin}/?view=calendar&gcal=error&msg=${encodeURIComponent(msg)}`,
    );

  if (!isGoogleConfigured()) {
    return fail("Google OAuth가 설정되지 않았습니다.");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    return fail(`Google 거부: ${oauthError}`);
  }
  if (!code || !state) {
    return fail("인증 코드가 없습니다.");
  }

  const saved = req.cookies.get(GCAL_STATE_COOKIE)?.value;
  if (!saved || saved !== state) {
    return fail("보안 상태값이 맞지 않습니다. 다시 연결해 주세요.");
  }

  try {
    const tokens = await exchangeCode(code);
    const email = await fetchGoogleEmail(tokens.access_token);
    const bundle = { ...tokens, email };
    const res = NextResponse.redirect(
      `${origin}/?view=calendar&gcal=connected`,
    );
    await writeTokenCookie(res, bundle);
    res.cookies.set(GCAL_STATE_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "연결 실패");
  }
}
