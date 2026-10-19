import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const SCOPE =
  "openid email https://www.googleapis.com/auth/calendar.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const GCAL_COOKIE = "ilbiseo_gcal";
export const GCAL_STATE_COOKIE = "ilbiseo_gcal_oauth_state";

export type GoogleTokenBundle = {
  access_token: string;
  refresh_token?: string;
  expiry: number; // epoch ms
  email?: string;
};

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getGoogleConfig(): GoogleConfig | null {
  const clientId =
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || "";
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleConfigured(): boolean {
  return getGoogleConfig() !== null;
}

function encryptionKey(): Buffer {
  const secret =
    process.env.TOKEN_ENCRYPTION_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    "ilbiseo-dev-only-insecure";
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM. 단일 사용자 앱용 httpOnly 쿠키 보관. */
export function sealTokens(bundle: GoogleTokenBundle): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(bundle), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function openTokens(sealed: string): GoogleTokenBundle | null {
  try {
    const buf = Buffer.from(sealed, "base64url");
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    const parsed = JSON.parse(plain.toString("utf8")) as GoogleTokenBundle;
    if (!parsed.access_token || !parsed.expiry) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildAuthUrl(state: string): string {
  const cfg = getGoogleConfig();
  if (!cfg) throw new Error("Google OAuth 미설정");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<GoogleTokenBundle> {
  const cfg = getGoogleConfig();
  if (!cfg) throw new Error("Google OAuth 미설정");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || "토큰 교환 실패",
    );
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expiry: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

/** Father-facing copy when Google rejects the stored refresh/access token. */
export const GOOGLE_RECONNECT_MESSAGE =
  "구글 연결이 만료됐습니다. 다시 연결해 주세요.";

/** True when Google (or our APIs) report expired / revoked / invalid_grant. */
export function isGoogleTokenRevokedError(text: string | undefined | null): boolean {
  if (!text) return false;
  return /token has been expired or revoked|invalid_grant|invalid credentials|expired or revoked|세션이 만료|연결이 만료|다시 연결해/i.test(
    text,
  );
}

export function mapGoogleAuthError(
  error?: string | null,
  errorDescription?: string | null,
): string {
  const blob = `${error ?? ""} ${errorDescription ?? ""}`.trim();
  if (isGoogleTokenRevokedError(blob) || /invalid_grant/i.test(blob)) {
    return GOOGLE_RECONNECT_MESSAGE;
  }
  if (/invalid_client|unauthorized_client/i.test(blob)) {
    return "구글 앱 설정에 문제가 있습니다. 관리자에게 알려 주세요.";
  }
  // Never surface raw English Google OAuth strings as the only UI copy.
  return GOOGLE_RECONNECT_MESSAGE;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<GoogleTokenBundle> {
  const cfg = getGoogleConfig();
  if (!cfg) throw new Error("Google OAuth 미설정");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(mapGoogleAuthError(json.error, json.error_description));
  }
  return {
    access_token: json.access_token,
    refresh_token: refreshToken,
    expiry: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { email?: string };
    return json.email;
  } catch {
    return undefined;
  }
}

export type GoogleApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  notes: string;
  calendarName: string;
  source: "google";
};

type GCalListItem = { id?: string; summary?: string; primary?: boolean };
type GEvent = {
  id?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

/** Strip HTML / noisy Google error bodies into short Korean messages. */
export function formatGoogleApiError(
  status: number,
  body: string,
  what: string,
): string {
  const raw = (body || "").trim();
  const looksHtml =
    /<\s*!doctype|<\s*html|Error 404 \(Not Found\)/i.test(raw) ||
    raw.startsWith("<");
  if (looksHtml) {
    if (status === 404) {
      return `${what}을(를) 찾지 못했습니다(404). Calendar API 주소가 올바른지·API가 켜져 있는지 확인하세요.`;
    }
    return `${what} 요청이 실패했습니다(HTTP ${status}). HTML 오류 페이지가 돌아왔습니다.`;
  }
  try {
    const j = JSON.parse(raw) as {
      error?: { message?: string; status?: string; code?: number };
    };
    const msg = j.error?.message?.trim();
    if (msg) {
      if (isGoogleTokenRevokedError(msg) || /invalid_grant|invalid credentials|unauth/i.test(msg)) {
        return GOOGLE_RECONNECT_MESSAGE;
      }
      if (/accessNotConfigured|has not been used|disabled/i.test(msg)) {
        return `Google Calendar API가 프로젝트에서 꺼져 있습니다. Cloud Console에서 Calendar API를 사용 설정하세요.`;
      }
      // Prefer Korean framing over raw English Google messages.
      if (/[A-Za-z]{8,}/.test(msg) && !/[가-힣]/.test(msg)) {
        return `${what}을(를) 불러오지 못했습니다. 잠시 후 다시 시도하거나 다시 연결해 주세요.`;
      }
      return `${what} 오류: ${msg.slice(0, 160)}`;
    }
  } catch {
    /* plain text */
  }
  const plain = raw.replace(/\s+/g, " ").slice(0, 160);
  return plain
    ? `${what} 오류(HTTP ${status}): ${plain}`
    : `${what} 오류(HTTP ${status})`;
}

async function listUserCalendars(
  accessToken: string,
): Promise<GCalListItem[]> {
  // Official endpoint: GET /calendar/v3/users/me/calendarList
  const listRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50&minAccessRole=reader",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) {
    const t = await listRes.text();
    // Fall back to primary so a list glitch still loads the main calendar
    if (listRes.status === 404 || listRes.status >= 500) {
      console.warn(
        "calendarList failed; falling back to primary:",
        formatGoogleApiError(listRes.status, t, "캘린더 목록"),
      );
      return [{ id: "primary", summary: "기본", primary: true }];
    }
    throw new Error(formatGoogleApiError(listRes.status, t, "캘린더 목록"));
  }
  const listJson = (await listRes.json()) as { items?: GCalListItem[] };
  const calendars = (listJson.items ?? []).filter((c) => c.id);
  if (calendars.length === 0) {
    return [{ id: "primary", summary: "기본", primary: true }];
  }
  // Prefer primary first
  calendars.sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
  return calendars;
}

/** Wide horizon for “전체” calendar sync (API requires bounds with orderBy=startTime). */
const FULL_YEARS_PAST = 10;
const FULL_YEARS_AHEAD = 10;
const EVENTS_PAGE_SIZE = 250; // Calendar API max per page
const MAX_PAGES_PER_CALENDAR = 40; // safety: ≤ 10_000 events / calendar
const MAX_CALENDARS = 12;
const MAX_TOTAL_EVENTS = 20_000;

export type FetchGoogleEventsOptions = {
  /** @deprecated Prefer full sync. If set, only loads from now → +daysAhead (legacy). */
  daysAhead?: number;
  /** When true (default), load ~10y past → ~10y ahead with pagination. */
  full?: boolean;
};

function mapGEvent(
  item: GEvent,
  cal: GCalListItem,
): GoogleApiEvent | null {
  const start = item.start?.dateTime || item.start?.date;
  if (!start) return null;
  const end = item.end?.dateTime || item.end?.date || null;
  const allDay = Boolean(item.start?.date && !item.start?.dateTime);
  return {
    id: `gcal:${cal.id}:${item.id ?? start}`,
    title: item.summary?.trim() || "(제목 없음)",
    start,
    end,
    allDay,
    notes: item.description?.trim() || "",
    calendarName: cal.summary || (cal.primary ? "기본 캘린더" : "캘린더"),
    source: "google",
  };
}

async function fetchEventsForCalendar(
  accessToken: string,
  cal: GCalListItem,
  timeMin: Date,
  timeMax: Date,
): Promise<{ events: GoogleApiEvent[]; error: string | null }> {
  const calId = encodeURIComponent(cal.id!);
  const events: GoogleApiEvent[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  let lastError: string | null = null;

  while (pages < MAX_PAGES_PER_CALENDAR) {
    pages += 1;
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(EVENTS_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const evRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!evRes.ok) {
      const t = await evRes.text();
      lastError = formatGoogleApiError(evRes.status, t, "일정");
      break;
    }
    const evJson = (await evRes.json()) as {
      items?: GEvent[];
      nextPageToken?: string;
    };
    for (const item of evJson.items ?? []) {
      const mapped = mapGEvent(item, cal);
      if (mapped) events.push(mapped);
    }
    pageToken = evJson.nextPageToken;
    if (!pageToken) break;
  }

  return { events, error: lastError };
}

/**
 * Load Google Calendar events across calendars.
 * Default: full-ish sync (~10 years past → ~10 years ahead) with nextPageToken pagination.
 */
export async function fetchUpcomingGoogleEvents(
  accessToken: string,
  daysAheadOrOpts: number | FetchGoogleEventsOptions = {},
): Promise<GoogleApiEvent[]> {
  const opts: FetchGoogleEventsOptions =
    typeof daysAheadOrOpts === "number"
      ? { daysAhead: daysAheadOrOpts, full: false }
      : daysAheadOrOpts;

  const full = opts.full !== false && opts.daysAhead == null;
  const timeMin = new Date();
  const timeMax = new Date();
  if (full) {
    timeMin.setFullYear(timeMin.getFullYear() - FULL_YEARS_PAST);
    timeMax.setFullYear(timeMax.getFullYear() + FULL_YEARS_AHEAD);
  } else {
    const days = Math.min(3650, Math.max(1, opts.daysAhead ?? 14));
    timeMax.setDate(timeMax.getDate() + days);
  }

  const calendars = await listUserCalendars(accessToken);
  const out: GoogleApiEvent[] = [];
  let lastEventError: string | null = null;

  for (const cal of calendars.slice(0, MAX_CALENDARS)) {
    if (out.length >= MAX_TOTAL_EVENTS) break;
    const { events, error } = await fetchEventsForCalendar(
      accessToken,
      cal,
      timeMin,
      timeMax,
    );
    if (error) lastEventError = error;
    for (const ev of events) {
      out.push(ev);
      if (out.length >= MAX_TOTAL_EVENTS) break;
    }
  }

  if (out.length === 0 && lastEventError) {
    throw new Error(lastEventError);
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

export const cookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
