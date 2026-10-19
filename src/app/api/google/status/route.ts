import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/google-oauth";
import {
  clearTokenCookie,
  ensureAccessToken,
  writeTokenCookie,
} from "@/lib/google-session";

export const runtime = "nodejs";

function missingKeys(): string[] {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].filter(
    (k) => {
      if (k === "GOOGLE_CLIENT_ID") {
        return !(
          process.env.GOOGLE_CLIENT_ID ||
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        );
      }
      return !process.env[k];
    },
  );
}

/**
 * Probe the per-device httpOnly cookie. Silently refresh when possible.
 * If Google says expired/revoked, clear the cookie and report disconnected
 * so the UI never shows a fake 「연결됨」.
 */
export async function GET() {
  const configured = isGoogleConfigured();
  if (!configured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      email: null,
      needsReconnect: false,
      error: null,
      missing: missingKeys(),
      setupHint:
        "Google 캘린더 연결에 필요한 키가 없습니다. 서버 환경 변수를 확인해 주세요.",
    });
  }

  const ensured = await ensureAccessToken();
  if ("error" in ensured) {
    const res = NextResponse.json({
      configured: true,
      connected: false,
      email: ensured.email ?? null,
      needsReconnect: ensured.needsReconnect,
      error: ensured.needsReconnect ? ensured.error : null,
      missing: [],
      setupHint:
        "Google 캘린더 연결에 필요한 키가 없습니다. 서버 환경 변수를 확인해 주세요.",
    });
    if (ensured.clearCookie) {
      await clearTokenCookie(res);
    }
    return res;
  }

  const res = NextResponse.json({
    configured: true,
    connected: true,
    email: ensured.bundle.email ?? null,
    needsReconnect: false,
    error: null,
    missing: [],
    setupHint:
      "Google 캘린더 연결에 필요한 키가 없습니다. 서버 환경 변수를 확인해 주세요.",
  });
  await writeTokenCookie(res, ensured.bundle);
  return res;
}
