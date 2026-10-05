import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  cookieOptions,
  GCAL_COOKIE,
  getGoogleConfig,
  isGoogleConfigured,
  openTokens,
  sealTokens,
  refreshAccessToken,
  type GoogleTokenBundle,
} from "@/lib/google-oauth";

export async function readTokenBundle(): Promise<GoogleTokenBundle | null> {
  const jar = await cookies();
  const raw = jar.get(GCAL_COOKIE)?.value;
  if (!raw) return null;
  return openTokens(raw);
}

export async function writeTokenCookie(
  response: NextResponse,
  bundle: GoogleTokenBundle,
): Promise<void> {
  response.cookies.set(GCAL_COOKIE, sealTokens(bundle), cookieOptions);
}

export async function clearTokenCookie(response: NextResponse): Promise<void> {
  response.cookies.set(GCAL_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

/** 만료 임박 시 refresh 후 쿠키에 반영할 번들 반환 */
export async function ensureAccessToken(
  response?: NextResponse,
): Promise<{ token: string; bundle: GoogleTokenBundle } | { error: string; status: number }> {
  if (!isGoogleConfigured() || !getGoogleConfig()) {
    return {
      error:
        "Google 연결이 설정되지 않았습니다. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI를 넣으세요.",
      status: 503,
    };
  }
  const current = await readTokenBundle();
  if (!current) {
    return { error: "Google 캘린더에 연결되어 있지 않습니다.", status: 401 };
  }
  if (current.expiry > Date.now() + 60_000) {
    return { token: current.access_token, bundle: current };
  }
  if (!current.refresh_token) {
    return {
      error: "세션이 만료되었습니다. 다시 연결해 주세요.",
      status: 401,
    };
  }
  try {
    const refreshed = await refreshAccessToken(current.refresh_token);
    const bundle: GoogleTokenBundle = {
      ...refreshed,
      email: current.email,
      refresh_token: refreshed.refresh_token || current.refresh_token,
    };
    if (response) {
      await writeTokenCookie(response, bundle);
    } else {
      const jar = await cookies();
      jar.set(GCAL_COOKIE, sealTokens(bundle), cookieOptions);
    }
    return { token: bundle.access_token, bundle };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "토큰 갱신 실패",
      status: 401,
    };
  }
}
