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
    throw new Error(
      json.error_description || json.error || "토큰 갱신 실패",
    );
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

export async function fetchUpcomingGoogleEvents(
  accessToken: string,
  daysAhead = 14,
): Promise<GoogleApiEvent[]> {
  const timeMin = new Date();
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + daysAhead);

  const listRes = await fetch(
    "https://www.googleapis.com/calendar/v3/calendarList?maxResults=20&minAccessRole=reader",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) {
    const t = await listRes.text();
    throw new Error(`캘린더 목록 오류: ${t.slice(0, 180)}`);
  }
  const listJson = (await listRes.json()) as { items?: GCalListItem[] };
  const calendars = (listJson.items ?? []).filter((c) => c.id);
  if (calendars.length === 0) {
    calendars.push({ id: "primary", summary: "기본" });
  }

  const out: GoogleApiEvent[] = [];
  for (const cal of calendars.slice(0, 10)) {
    const calId = encodeURIComponent(cal.id!);
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "40",
    });
    const evRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!evRes.ok) continue;
    const evJson = (await evRes.json()) as { items?: GEvent[] };
    for (const item of evJson.items ?? []) {
      const start = item.start?.dateTime || item.start?.date;
      if (!start) continue;
      const end = item.end?.dateTime || item.end?.date || null;
      const allDay = Boolean(item.start?.date && !item.start?.dateTime);
      out.push({
        id: `gcal:${cal.id}:${item.id ?? start}`,
        title: item.summary?.trim() || "(제목 없음)",
        start,
        end,
        allDay,
        notes: item.description?.trim() || "",
        calendarName: cal.summary || (cal.primary ? "기본 캘린더" : "캘린더"),
        source: "google",
      });
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out.slice(0, 100);
}

export const cookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
