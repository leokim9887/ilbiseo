import { createId } from "./id";
import type { CalendarEvent } from "./types";

export type IcsErrorCode =
  | "invalid_url"
  | "invalid_ics"
  | "fetch_failed"
  | "empty_body"
  | "no_events";

export class IcsError extends Error {
  code: IcsErrorCode;
  detail?: string;

  constructor(code: IcsErrorCode, message: string, detail?: string) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

/** RFC5545 line unfolding */
export function unfoldIcs(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
}

export function looksLikeCalendarUrl(input: string): boolean {
  const t = input.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t) || /^webcal:\/\//i.test(t)) return true;
  if (/calendar\.google\.com\/calendar\/ical\//i.test(t)) return true;
  return false;
}

export function normalizeCalendarFeedUrl(input: string): string {
  let u = input.trim();
  if (!u) {
    throw new IcsError(
      "invalid_url",
      "URL이 비어 있습니다. Google iCal 주소 전체를 붙여 넣으세요.",
    );
  }
  if (/^webcal:\/\//i.test(u)) {
    u = `https://${u.slice("webcal://".length)}`;
  }
  if (!/^https?:\/\//i.test(u)) {
    throw new IcsError(
      "invalid_url",
      "주소 형식이 맞지 않습니다. https:// 로 시작하는 iCal URL인지 확인하세요.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new IcsError(
      "invalid_url",
      "URL을 읽을 수 없습니다. 복사한 주소 끝에 basic.ics 가 있는지 확인하세요.",
    );
  }
  const href = parsed.href;
  const ok =
    /\.ics$/i.test(parsed.pathname) ||
    /\/calendar\/ical\//i.test(href) ||
    /calendar\.google\.com/i.test(parsed.hostname);
  if (!ok) {
    throw new IcsError(
      "invalid_url",
      "Google 캘린더 iCal 주소가 아닌 것 같습니다. (…/ical/…/basic.ics 형태)",
    );
  }
  return href;
}

function readProp(block: string, name: string): string | null {
  const re = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "im");
  const m = block.match(re);
  if (!m) return null;
  return m[1]
    .trim()
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDateValue(raw: string): {
  iso: string;
  allDay: boolean;
} | null {
  const v = raw.trim();
  if (/^\d{8}$/.test(v)) {
    return {
      iso: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`,
      allDay: true,
    };
  }
  const compact = v.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/,
  );
  if (compact) {
    const [, y, mo, d, h, mi, s, z] = compact;
    if (z) {
      const utc = new Date(
        Date.UTC(
          Number(y),
          Number(mo) - 1,
          Number(d),
          Number(h),
          Number(mi),
          Number(s),
        ),
      );
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${utc.getFullYear()}-${pad(utc.getMonth() + 1)}-${pad(utc.getDate())}T${pad(utc.getHours())}:${pad(utc.getMinutes())}:${pad(utc.getSeconds())}`;
      return { iso: local, allDay: false };
    }
    return {
      iso: `${y}-${mo}-${d}T${h}:${mi}:${s}`,
      allDay: false,
    };
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    return { iso: v.slice(0, 19), allDay: v.length <= 10 };
  }
  return null;
}

export function parseIcsToEvents(text: string): CalendarEvent[] {
  const unfolded = unfoldIcs(text);
  if (!/BEGIN:VCALENDAR/i.test(unfolded)) {
    throw new IcsError(
      "invalid_ics",
      "ICS 내용이 아닙니다. URL만 넣었다면 「가져오기」로 서버가 받아옵니다.",
    );
  }
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  if (blocks.length === 0) {
    throw new IcsError(
      "no_events",
      "일정이 0건입니다. 캘린더가 비어 있거나, 공개 iCal URL이 맞는지 확인하세요.",
    );
  }
  const events: CalendarEvent[] = [];
  for (const block of blocks) {
    const chunk = `BEGIN:VEVENT${block}`;
    if (!/END:VEVENT/i.test(chunk)) continue;
    const summary = readProp(chunk, "SUMMARY") || "제목 없는 일정";
    const startRaw = readProp(chunk, "DTSTART");
    if (!startRaw) continue;
    const startParsed = parseIcsDateValue(startRaw);
    if (!startParsed) continue;
    const endRaw = readProp(chunk, "DTEND");
    let end: string | null = null;
    let allDay = startParsed.allDay;
    if (endRaw) {
      const endParsed = parseIcsDateValue(endRaw);
      if (endParsed) {
        end = endParsed.iso;
        allDay = allDay && endParsed.allDay;
      }
    }
    const desc = readProp(chunk, "DESCRIPTION") || "";
    const calName =
      readProp(unfolded, "X-WR-CALNAME") ||
      readProp(unfolded, "NAME") ||
      undefined;
    events.push({
      id: createId(),
      title: summary,
      start: startParsed.iso,
      end,
      allDay,
      notes: desc.trim() || "ICS import",
      source: "ics",
      calendarName: calName,
    });
  }
  if (events.length === 0) {
    throw new IcsError(
      "no_events",
      "VEVENT는 있으나 읽을 수 있는 일정이 없습니다. DTSTART 형식을 확인하세요.",
    );
  }
  return events;
}

export async function fetchIcsFromUrl(url: string): Promise<string> {
  const normalized = normalizeCalendarFeedUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(normalized, {
      signal: controller.signal,
      headers: {
        Accept: "text/calendar, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (compatible; Ilbiseo/1.0; +https://ilbiseo.local) AppleWebKit/537.36",
      },
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new IcsError(
        "fetch_failed",
        `캘린더 주소를 가져오지 못했습니다 (HTTP ${res.status}). 공개 iCal URL인지, 비밀 주소(ICS)를 썼는지 확인하세요.`,
        `status=${res.status}`,
      );
    }
    const text = await res.text();
    if (!text.trim()) {
      throw new IcsError(
        "empty_body",
        "응답이 비어 있습니다. URL이 만료되었거나 잘못 복사되었을 수 있습니다.",
      );
    }
    return text;
  } catch (e) {
    if (e instanceof IcsError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new IcsError(
        "fetch_failed",
        "네트워크 시간이 초과되었습니다. URL을 다시 확인하세요.",
      );
    }
    throw new IcsError(
      "fetch_failed",
      "네트워크 오류로 iCal을 받지 못했습니다. 브라우저 CORS가 아니라 서버가 대신 받습니다 — URL 전체(basic.ics 포함)를 붙여 넣으세요.",
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function importIcsFromInput(input: string): Promise<CalendarEvent[]> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new IcsError("invalid_ics", "붙여 넣을 내용이 없습니다.");
  }
  if (looksLikeCalendarUrl(trimmed)) {
    const body = await fetchIcsFromUrl(trimmed);
    return parseIcsToEvents(body);
  }
  return parseIcsToEvents(trimmed);
}

export function icsErrorMessage(err: unknown): string {
  if (err instanceof IcsError) return err.message;
  if (err instanceof Error) return err.message;
  return "ICS 가져오기 실패";
}

export function icsErrorCode(err: unknown): IcsErrorCode | "unknown" {
  if (err instanceof IcsError) return err.code;
  return "unknown";
}
