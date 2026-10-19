import type {
  AppState,
  CalendarEvent,
  SideListItem,
  Task,
} from "./types";
import { APP_VERSION } from "./types";
import { normalizeTaskDeadlineDates } from "./date-range";

function normalizeDeletions(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || typeof at !== "string") continue;
    const t = Date.parse(at);
    if (Number.isNaN(t)) continue;
    out[id] = new Date(t).toISOString();
  }
  return out;
}

/**
 * Safe multi-device merge for PC ↔ phone (and 3+ devices).
 *
 * - Unions collections by `id` (items only on one device are kept)
 * - On same-id conflicts, prefers the side with the newer blob `updatedAt`
 * - Sticky completion: if either side is done/completed, keep completed
 * - **Deletions / tombstones:** `deletions[id] = deletedAt` — after union,
 *   drop any entity whose id is tombstoned. Deletion wins over a peer that
 *   still carries the old row (prevents add→delete→refresh resurrection).
 *
 * Google Calendar OAuth stays per-device (not in AppState).
 */

export type MergePrefer = "local" | "remote";

function parseTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export function preferSideFromTimestamps(
  localUpdatedAt: string | null | undefined,
  remoteUpdatedAt: string | null | undefined,
): MergePrefer {
  const localT = parseTime(localUpdatedAt);
  const remoteT = parseTime(remoteUpdatedAt);
  if (remoteT > localT) return "remote";
  if (localT > remoteT) return "local";
  return "remote";
}

export function maxIsoTimestamp(
  a: string | null | undefined,
  b: string | null | undefined,
): string {
  const aT = parseTime(a);
  const bT = parseTime(b);
  if (aT >= bT && a) return a;
  if (b) return b;
  return new Date().toISOString();
}

/** Merge tombstone maps — later deletedAt wins per id. */
export function mergeDeletions(
  local: Record<string, string> | undefined,
  remote: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {
    ...normalizeDeletions(local),
  };
  for (const [id, at] of Object.entries(normalizeDeletions(remote))) {
    const prev = out[id];
    if (!prev || parseTime(at) >= parseTime(prev)) out[id] = at;
  }
  return out;
}

function pickTask(a: Task, b: Task, prefer: MergePrefer): Task {
  const preferred = prefer === "local" ? a : b;
  const other = prefer === "local" ? b : a;

  const aDone = a.status === "completed";
  const bDone = b.status === "completed";
  if (aDone !== bDone) {
    return aDone ? a : b;
  }
  if (aDone && bDone) {
    const aC = parseTime(a.completedAt);
    const bC = parseTime(b.completedAt);
    if (aC !== bC) return aC >= bC ? a : b;
  }
  return normalizeTaskDeadlineDates({
    ...preferred,
    title: preferred.title.trim() || other.title,
    memo: preferred.memo || other.memo,
    groupKey: preferred.groupKey || other.groupKey,
    startDate: preferred.startDate ?? other.startDate,
    targetDate: preferred.targetDate ?? other.targetDate,
  });
}

function pickSideItem(
  a: SideListItem,
  b: SideListItem,
  prefer: MergePrefer,
): SideListItem {
  const preferred = prefer === "local" ? a : b;
  const other = prefer === "local" ? b : a;
  if (a.done !== b.done) {
    return a.done ? a : b;
  }
  if (a.done && b.done) {
    const aC = parseTime(a.completedAt);
    const bC = parseTime(b.completedAt);
    if (aC !== bC) return aC >= bC ? a : b;
  }
  return {
    ...preferred,
    title: preferred.title.trim() || other.title,
    memo: preferred.memo || other.memo,
  };
}

function pickCalendar(
  a: CalendarEvent,
  b: CalendarEvent,
  prefer: MergePrefer,
): CalendarEvent {
  const preferred = prefer === "local" ? a : b;
  const other = prefer === "local" ? b : a;
  return {
    ...preferred,
    title: preferred.title.trim() || other.title,
    notes: preferred.notes || other.notes,
    calendarName: preferred.calendarName || other.calendarName,
  };
}

function mergeById<T extends { id: string }>(
  local: T[],
  remote: T[],
  prefer: MergePrefer,
  pick: (a: T, b: T, prefer: MergePrefer) => T,
): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    map.set(item.id, pick(existing, item, prefer));
  }
  return [...map.values()];
}

function dropTombstoned<T extends { id: string }>(
  items: T[],
  deletions: Record<string, string>,
): T[] {
  if (!deletions || Object.keys(deletions).length === 0) return items;
  return items.filter((item) => !(item.id in deletions));
}

/** Stable fingerprint for “did merge change anything?” checks. */
export function fingerprintState(state: AppState): string {
  const deletions = normalizeDeletions(state.deletions);
  const norm = {
    version: state.version,
    tasks: [...state.tasks].sort((a, b) => a.id.localeCompare(b.id)),
    guidelines: [...state.guidelines].sort((a, b) => a.id.localeCompare(b.id)),
    habits: [...state.habits].sort((a, b) => a.id.localeCompare(b.id)),
    calendarEvents: [...state.calendarEvents].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    deletions: Object.keys(deletions)
      .sort()
      .map((id) => [id, deletions[id]]),
  };
  return JSON.stringify(norm);
}

export function mergeAppStates(
  local: AppState,
  remote: AppState,
  prefer: MergePrefer,
): AppState {
  const deletions = mergeDeletions(local.deletions, remote.deletions);
  return {
    version: Math.max(
      local.version || APP_VERSION,
      remote.version || APP_VERSION,
      APP_VERSION,
    ),
    tasks: dropTombstoned(
      mergeById(local.tasks, remote.tasks, prefer, pickTask),
      deletions,
    ),
    checklists: [],
    calendarEvents: dropTombstoned(
      mergeById(local.calendarEvents, remote.calendarEvents, prefer, pickCalendar),
      deletions,
    ),
    guidelines: dropTombstoned(
      mergeById(local.guidelines, remote.guidelines, prefer, pickSideItem),
      deletions,
    ),
    habits: dropTombstoned(
      mergeById(local.habits, remote.habits, prefer, pickSideItem),
      deletions,
    ),
    deletions,
  };
}

/**
 * Merge local + remote and decide whether a push is needed after hydrate.
 * Push when merged differs from remote (local contributed) or local clock is ahead.
 */
export function mergeForSync(args: {
  local: AppState;
  remote: AppState;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string;
}): {
  merged: AppState;
  prefer: MergePrefer;
  mergedUpdatedAt: string;
  shouldPush: boolean;
} {
  const prefer = preferSideFromTimestamps(
    args.localUpdatedAt,
    args.remoteUpdatedAt,
  );
  const merged = mergeAppStates(args.local, args.remote, prefer);
  const remoteFp = fingerprintState(args.remote);
  const mergedFp = fingerprintState(merged);
  const localAhead =
    parseTime(args.localUpdatedAt) > parseTime(args.remoteUpdatedAt);
  const shouldPush = mergedFp !== remoteFp || localAhead;
  const mergedUpdatedAt = shouldPush
    ? new Date(
        Math.max(
          Date.now(),
          parseTime(args.localUpdatedAt),
          parseTime(args.remoteUpdatedAt) + 1,
        ),
      ).toISOString()
    : maxIsoTimestamp(args.localUpdatedAt, args.remoteUpdatedAt);
  return { merged, prefer, mergedUpdatedAt, shouldPush };
}
