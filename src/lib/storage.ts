import {
  APP_VERSION,
  CATEGORY_LABEL,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  isLegacySideCategory,
  parseTaskCategory,
  type AppState,
  type CalendarEvent,
  type ChecklistItem,
  type SideListItem,
  type Task,
} from "./types";
import { createId } from "./id";
import { inferGroupKey, orderByCreatedAtNewestFirst } from "./sort";
import { clampPriority } from "./priority";
import {
  normalizeTaskDeadlineDates,
  todayIsoKst,
} from "./date-range";

export function createEmptyState(): AppState {
  return {
    version: APP_VERSION,
    tasks: [],
    checklists: [],
    calendarEvents: [],
    guidelines: [],
    habits: [],
    deletions: {},
  };
}

/** Normalize raw deletions map (id → ISO deletedAt). */
export function normalizeDeletions(raw: unknown): Record<string, string> {
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

/** Record tombstones and strip matching entities from collections. */
export function applyLocalDeletions(
  state: AppState,
  ids: string[],
  deletedAt: string = new Date().toISOString(),
): AppState {
  if (ids.length === 0) return state;
  const remove = new Set(ids);
  const deletions = { ...state.deletions };
  for (const id of ids) deletions[id] = deletedAt;
  return {
    ...state,
    deletions,
    tasks: state.tasks.filter((t) => !remove.has(t.id)),
    guidelines: state.guidelines.filter((i) => !remove.has(i.id)),
    habits: state.habits.filter((i) => !remove.has(i.id)),
    calendarEvents: state.calendarEvents.filter((e) => !remove.has(e.id)),
  };
}

/** Drop tombstones when an id is intentionally re-added (rare). */
export function clearDeletions(state: AppState, ids: string[]): AppState {
  if (ids.length === 0 || !state.deletions) return state;
  let changed = false;
  const deletions = { ...state.deletions };
  for (const id of ids) {
    if (id in deletions) {
      delete deletions[id];
      changed = true;
    }
  }
  return changed ? { ...state, deletions } : state;
}

function migrateSideItem(raw: Record<string, unknown>): SideListItem {
  return {
    id: String(raw.id ?? createId()),
    title: String(raw.title ?? "").trim() || "새 항목",
    memo: String(raw.memo ?? raw.notes ?? ""),
    done: Boolean(
      raw.done ?? (raw.status === "completed" || raw.checked),
    ),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    completedAt: (raw.completedAt as string | null) ?? null,
  };
}

function taskToSideItem(raw: Record<string, unknown>): SideListItem {
  return {
    id: String(raw.id ?? createId()),
    title: String(raw.title ?? "새 항목").trim() || "새 항목",
    memo: String(raw.memo ?? raw.notes ?? ""),
    done:
      raw.status === "completed" ||
      Boolean(raw.done) ||
      Boolean(raw.checked),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    completedAt: (raw.completedAt as string | null) ?? null,
  };
}

function migrateTask(
  raw: Record<string, unknown>,
  today: string = todayIsoKst(),
): Task {
  const title = String(raw.title ?? "할 일");
  const notes = String(raw.notes ?? raw.memo ?? "");
  const end =
    (raw.targetDate as string | null) ??
    (raw.endDate as string | null) ??
    null;
  const start = (raw.startDate as string | null) ?? null;
  const base: Task = {
    id: String(raw.id ?? createId()),
    title,
    category: parseTaskCategory(raw.category),
    kind: (raw.kind as Task["kind"]) || "someday",
    startDate: start,
    targetDate: end,
    urgency: clampPriority(raw.urgency, 2),
    importance: clampPriority(raw.importance, 2),
    groupKey: String(raw.groupKey ?? title),
    memo: notes,
    source:
      raw.source === "calendar"
        ? "import"
        : ((raw.source as Task["source"]) || "manual"),
    status: (raw.status as Task["status"]) || "active",
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    completedAt: (raw.completedAt as string | null) ?? null,
  };
  // Fix stored 「과거 ~ 오늘」 from older tilde/import bugs without re-import
  return normalizeTaskDeadlineDates(base, today);
}

/** Fold leftover checklist items into someday tasks; always persist empty checklists. */
function foldChecklistsIntoTasks(
  tasks: Task[],
  checklists: ChecklistItem[],
): Task[] {
  if (!checklists.length) return tasks;
  const existing = new Set(
    tasks.map((t) => `${t.category}::${t.title.trim().toLowerCase()}`),
  );
  const extras: Task[] = [];
  for (const c of checklists) {
    if (c.checked) continue;
    const title = String(c.title || "").trim();
    if (!title) continue;
    const key = `${c.category}::${title.toLowerCase()}`;
    if (existing.has(key)) continue;
    existing.add(key);
    extras.push({
      id: createId(),
      title,
      category: parseTaskCategory(c.category),
      kind: "someday",
      startDate: null,
      targetDate: null,
      urgency: 2,
      importance: 2,
      groupKey: inferGroupKey(title),
      memo: "예전 체크리스트에서 옮김",
      source: "import",
      status: "active",
      createdAt: c.createdAt || new Date().toISOString(),
      completedAt: null,
    });
  }
  return extras.length ? [...tasks, ...extras] : tasks;
}

function mergeSideLists(
  existing: SideListItem[],
  incoming: SideListItem[],
): SideListItem[] {
  if (!incoming.length) return existing;
  const seen = new Set(existing.map((i) => i.id));
  const out = [...existing];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.tasks)) return null;

  const rawVersion = Number(obj.version ?? 0);
  const today = todayIsoKst();
  const rawTasks = obj.tasks as Record<string, unknown>[];
  const migratedGuidelines: SideListItem[] = [];
  const migratedHabits: SideListItem[] = [];
  const keptTasks: Task[] = [];
  let deadlineCollapsed = false;

  for (const t of rawTasks) {
    if (!t || typeof t !== "object") continue;
    if (isLegacySideCategory(t.category)) {
      const item = taskToSideItem(t);
      if (t.category === "guideline") migratedGuidelines.push(item);
      else migratedHabits.push(item);
      continue;
    }
    const beforeStart = (t.startDate as string | null) ?? null;
    const beforeEnd =
      (t.targetDate as string | null) ??
      (t.endDate as string | null) ??
      null;
    const migrated = migrateTask(t, today);
    if (
      migrated.startDate !== beforeStart ||
      migrated.targetDate !== beforeEnd
    ) {
      deadlineCollapsed = true;
    }
    keptTasks.push(migrated);
  }

  const legacyChecks = Array.isArray(obj.checklists)
    ? (obj.checklists as ChecklistItem[])
    : [];

  const fromFieldGuidelines = Array.isArray(obj.guidelines)
    ? (obj.guidelines as Record<string, unknown>[]).map(migrateSideItem)
    : [];
  const fromFieldHabits = Array.isArray(obj.habits)
    ? (obj.habits as Record<string, unknown>[]).map(migrateSideItem)
    : [];

  const deletions = normalizeDeletions(obj.deletions);
  let tasks = foldChecklistsIntoTasks(keptTasks, legacyChecks).filter(
    (t) => !(t.id in deletions),
  );
  let guidelines = mergeSideLists(
    fromFieldGuidelines,
    migratedGuidelines,
  ).filter((i) => !(i.id in deletions));
  let habits = mergeSideLists(fromFieldHabits, migratedHabits).filter(
    (i) => !(i.id in deletions),
  );
  // v5: arrays are newest-first. Pre-v5 data was append-order (oldest first).
  if (rawVersion < 5) {
    tasks = orderByCreatedAtNewestFirst(tasks);
    guidelines = orderByCreatedAtNewestFirst(guidelines);
    habits = orderByCreatedAtNewestFirst(habits);
  }
  const calendarEvents = (
    Array.isArray(obj.calendarEvents)
      ? (obj.calendarEvents as CalendarEvent[])
      : []
  ).filter((e) => !(e.id in deletions));

  return {
    version: APP_VERSION,
    tasks,
    checklists: [],
    calendarEvents,
    guidelines,
    habits,
    deletions,
    // Internal: loadState persists when true (stripped before return to callers
    // via normalizeStateResult — see below). Stored only ephemerally.
    ...(deadlineCollapsed ? { __deadlineCollapsed: true } : {}),
  } as AppState;
}

/** True when normalizeState collapsed any past~today deadline. */
export function stateHadDeadlineCollapse(state: AppState): boolean {
  return Boolean(
    (state as AppState & { __deadlineCollapsed?: boolean }).__deadlineCollapsed,
  );
}

function stripDeadlineCollapseFlag(state: AppState): AppState {
  if (!("__deadlineCollapsed" in state)) return state;
  const { __deadlineCollapsed: _, ...rest } = state as AppState & {
    __deadlineCollapsed?: boolean;
  };
  return rest;
}

export function loadState(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const v2 = localStorage.getItem(STORAGE_KEY);
    if (v2) {
      const parsed = JSON.parse(v2) as {
        checklists?: unknown[];
        tasks?: unknown[];
        guidelines?: unknown[];
        habits?: unknown[];
        version?: number;
      };
      const hadChecks =
        Array.isArray(parsed.checklists) && parsed.checklists.length > 0;
      const rawTasks = Array.isArray(parsed.tasks)
        ? (parsed.tasks as Record<string, unknown>[])
        : [];
      const needsStartMigrate = rawTasks.some(
        (t) => t && typeof t === "object" && !("startDate" in t),
      );
      const needsSideMigrate =
        rawTasks.some(
          (t) => t && typeof t === "object" && isLegacySideCategory(t.category),
        ) ||
        !Array.isArray(parsed.guidelines) ||
        !Array.isArray(parsed.habits) ||
        Number(parsed.version ?? 0) < APP_VERSION;
      const n = normalizeState(parsed);
      if (n) {
        const collapsed = stateHadDeadlineCollapse(n);
        const clean = stripDeadlineCollapseFlag(n);
        if (
          hadChecks ||
          needsStartMigrate ||
          needsSideMigrate ||
          collapsed
        ) {
          saveState(clean);
        }
        return clean;
      }
    }
    const v1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (v1) {
      const legacy = JSON.parse(v1) as { tasks?: unknown[] };
      const n = normalizeState({
        version: APP_VERSION,
        tasks: legacy.tasks ?? [],
        checklists: [],
        calendarEvents: [],
        guidelines: [],
        habits: [],
      });
      if (n) {
        saveState(stripDeadlineCollapseFlag(n));
        return stripDeadlineCollapseFlag(n);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  const clean: AppState = {
    ...state,
    checklists: [],
    guidelines: state.guidelines ?? [],
    habits: state.habits ?? [],
    deletions: normalizeDeletions(state.deletions),
    version: APP_VERSION,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

/** @deprecated Prefer createEmptyState — no seed data. */
export function createSampleState(): AppState {
  return createEmptyState();
}

export { CATEGORY_LABEL };
