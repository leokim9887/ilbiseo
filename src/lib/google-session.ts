import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  cookieOptions,
  GCAL_COOKIE,
  getGoogleConfig,
  GOOGLE_RECONNECT_MESSAGE,
  isGoogleConfigured,
  isGoogleTokenRevokedError,
  openTokens,
  sealTokens,
  refreshAccessToken,
  type GoogleTokenBundle,
} from "@/lib/google-oauth";

export type EnsureAccessOk = {
  token: string;
  bundle: GoogleTokenBundle;
};

export type EnsureAccessErr = {
  error: string;
  status: number;
  needsReconnect: boolean;
  clearCookie: boolean;
  /** Last known email before clearing a revoked cookie (for reconnect UI). */
  email?: string | null;
};

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

async function persistBundle(
  bundle: GoogleTokenBundle,
  response?: NextResponse,
): Promise<void> {
  if (response) {
    await writeTokenCookie(response, bundle);
    return;
  }
  const jar = await cookies();
  jar.set(GCAL_COOKIE, sealTokens(bundle), cookieOptions);
}

async function revokeLocalSession(response?: NextResponse): Promise<void> {
  if (response) {
    await clearTokenCookie(response);
    return;
  }
  const jar = await cookies();
  jar.set(GCAL_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

function reconnectError(
  message = GOOGLE_RECONNECT_MESSAGE,
  status = 401,
  email?: string | null,
): EnsureAccessErr {
  return {
    error: message,
    status,
    needsReconnect: true,
    clearCookie: true,
    email: email ?? null,
  };
}

/**
 * Return a usable access token. Silently refreshes when expiry is near.
 * On expired/revoked refresh failure: clear the httpOnly cookie so UI cannot
 * keep showing a fake 「연결됨」 state.
 */
export async function ensureAccessToken(
  response?: NextResponse,
  opts?: { forceRefresh?: boolean },
): Promise<EnsureAccessOk | EnsureAccessErr> {
  if (!isGoogleConfigured() || !getGoogleConfig()) {
    return {
      error:
        "Google 연결이 설정되지 않았습니다. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI를 넣으세요.",
      status: 503,
      needsReconnect: false,
      clearCookie: false,
    };
  }
  const current = await readTokenBundle();
  if (!current) {
    return {
      error: "Google 캘린더에 연결되어 있지 않습니다.",
      status: 401,
      needsReconnect: false,
      clearCookie: false,
    };
  }

  const stillFresh = current.expiry > Date.now() + 60_000;
  if (stillFresh && !opts?.forceRefresh) {
    return { token: current.access_token, bundle: current };
  }

  if (!current.refresh_token) {
    await revokeLocalSession(response);
    return reconnectError(GOOGLE_RECONNECT_MESSAGE, 401, current.email);
  }

  try {
    const refreshed = await refreshAccessToken(current.refresh_token);
    const bundle: GoogleTokenBundle = {
      ...refreshed,
      email: current.email,
      refresh_token: refreshed.refresh_token || current.refresh_token,
    };
    await persistBundle(bundle, response);
    return { token: bundle.access_token, bundle };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "토큰 갱신 실패";
    const friendly = isGoogleTokenRevokedError(raw)
      ? GOOGLE_RECONNECT_MESSAGE
      : raw.includes("구글") || /[가-힣]/.test(raw)
        ? raw
        : GOOGLE_RECONNECT_MESSAGE;
    await revokeLocalSession(response);
    return reconnectError(friendly, 401, current.email);
  }
}
