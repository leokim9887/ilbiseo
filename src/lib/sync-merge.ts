import type {
  AppState,
  CalendarEvent,
  SideListItem,
  Task,
} from "./types";
import { APP_VERSION } from "./types";

/**
 * Safe multi-device merge for PC ↔ phone (and 3+ devices).
 *
 * Whole-blob LWW alone can wipe sibling edits (A adds a task, B edits another,
 * then B's push replaces A's addition). This merge:
 * - Unions collections by `id` (items only on one device are kept)
 * - On same-id conflicts, prefers the side with the newer blob `updatedAt`
 * - Sticky completion: if either side is done/completed, keep the completed form
 *   (completion is father-critical and must not flip back silently)
 *
 * Google Calendar OAuth stays per-device (cookies/tokens are not in AppState).
 * Cached calendarEvents still merge by id like other lists.
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

function pickTask(a: Task, b: Task, prefer: MergePrefer): Task {
  const preferred = prefer === "local" ? a : b;
  const other = prefer === "local" ? b : a;

  const aDone = a.status === "completed";
  const bDone = b.status === "completed";
  if (aDone !== bDone) {
    // Sticky completion: keep the completed record.
    return aDone ? a : b;
  }
  if (aDone && bDone) {
    const aC = parseTime(a.completedAt);
    const bC = parseTime(b.completedAt);
    if (aC !== bC) return aC >= bC ? a : b;
  }
  // Same status — prefer newer blob's full item, but keep richer non-empty fields
  // from the other side when preferred left them blank.
  return {
    ...preferred,
    title: preferred.title.trim() || other.title,
    memo: preferred.memo || other.memo,
    groupKey: preferred.groupKey || other.groupKey,
    startDate: preferred.startDate ?? other.startDate,
    targetDate: preferred.targetDate ?? other.targetDate,
  };
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

/** Stable fingerprint for “did merge change anything?” checks. */
export function fingerprintState(state: AppState): string {
  const norm = {
    version: state.version,
    tasks: [...state.tasks].sort((a, b) => a.id.localeCompare(b.id)),
    guidelines: [...state.guidelines].sort((a, b) => a.id.localeCompare(b.id)),
    habits: [...state.habits].sort((a, b) => a.id.localeCompare(b.id)),
    calendarEvents: [...state.calendarEvents].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  };
  return JSON.stringify(norm);
}

export function mergeAppStates(
  local: AppState,
  remote: AppState,
  prefer: MergePrefer,
): AppState {
  return {
    version: Math.max(local.version || APP_VERSION, remote.version || APP_VERSION, APP_VERSION),
    tasks: mergeById(local.tasks, remote.tasks, prefer, pickTask),
    checklists: [],
    calendarEvents: mergeById(
      local.calendarEvents,
      remote.calendarEvents,
      prefer,
      pickCalendar,
    ),
    guidelines: mergeById(
      local.guidelines,
      remote.guidelines,
      prefer,
      pickSideItem,
    ),
    habits: mergeById(local.habits, remote.habits, prefer, pickSideItem),
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
