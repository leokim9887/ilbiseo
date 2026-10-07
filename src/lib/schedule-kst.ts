/** Next 08:00 Asia/Seoul wall-clock helpers. */

const KST = "Asia/Seoul";

function partsInKst(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

/** Instant for a KST calendar day at HH:MM. */
export function kstWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  // Iterate to resolve KST offset (UTC+9, no DST)
  const guess = Date.UTC(year, month - 1, day, hour - 9, minute, 0);
  return new Date(guess);
}

export function nextBriefingUtc(
  hour = 8,
  minute = 0,
  now = new Date(),
): Date {
  const p = partsInKst(now);
  let target = kstWallTimeToUtc(p.year, p.month, p.day, hour, minute);
  if (now.getTime() >= target.getTime()) {
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    target = kstWallTimeToUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      hour,
      minute,
    );
  }
  return target;
}

export function formatNextBriefingKo(d: Date): string {
  return d.toLocaleString("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
