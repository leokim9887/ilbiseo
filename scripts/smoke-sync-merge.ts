/**
 * Unit smoke: sync code normalize + entity-level merge (no whole-state wipe).
 * Run: npx tsx scripts/smoke-sync-merge.ts
 */
import {
  generateSyncCode,
  isValidSyncCode,
  normalizeSyncCode,
} from "../src/lib/sync-crypto";
import {
  fingerprintState,
  mergeAppStates,
  mergeForSync,
  preferSideFromTimestamps,
} from "../src/lib/sync-merge";
import { createEmptyState } from "../src/lib/storage";
import type { AppState, Task } from "../src/lib/types";

function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exit(1);
  }
  console.log("ok", name, detail ?? "");
}

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: null,
    targetDate: null,
    urgency: 3,
    importance: 3,
    groupKey: "",
    memo: "",
    source: "manual",
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
    completedAt: null,
    ...partial,
  };
}

// --- normalize ---
ok(
  "normalize spaces/lowercase",
  normalizeSyncCode(" abcd efgh ijkl ") === "ABCD-EFGH-IJKL",
);
ok(
  "normalize dashes already",
  normalizeSyncCode("ABCD-EFGH-IJKL") === "ABCD-EFGH-IJKL",
);
ok("normalize strips junk", normalizeSyncCode("ab-cd_efgh!!ijkl") === "ABCD-EFGH-IJKL");
ok("valid generated", isValidSyncCode(generateSyncCode()));
ok("invalid short", !isValidSyncCode("ABCD-EFGH"));

// --- prefer side ---
ok(
  "prefer remote newer",
  preferSideFromTimestamps("2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z") ===
    "remote",
);
ok(
  "prefer local newer",
  preferSideFromTimestamps("2026-01-03T00:00:00.000Z", "2026-01-02T00:00:00.000Z") ===
    "local",
);

// --- union merge: sibling additions kept ---
const local: AppState = {
  ...createEmptyState(),
  tasks: [task({ id: "a", title: "PC만" })],
};
const remote: AppState = {
  ...createEmptyState(),
  tasks: [task({ id: "b", title: "폰만" })],
};
const union = mergeAppStates(local, remote, "remote");
ok(
  "union keeps both ids",
  union.tasks.length === 2 &&
    union.tasks.some((t) => t.id === "a") &&
    union.tasks.some((t) => t.id === "b"),
);

// --- sticky completion ---
const localActive = {
  ...createEmptyState(),
  tasks: [task({ id: "x", title: "할일", status: "active", completedAt: null })],
};
const remoteDone = {
  ...createEmptyState(),
  tasks: [
    task({
      id: "x",
      title: "할일",
      status: "completed",
      completedAt: "2026-10-10T12:00:00.000Z",
    }),
  ],
};
const sticky = mergeAppStates(localActive, remoteDone, "local");
ok(
  "sticky completion wins over local-prefer",
  sticky.tasks[0]?.status === "completed" &&
    sticky.tasks[0]?.completedAt === "2026-10-10T12:00:00.000Z",
);

// --- field prefer from newer blob ---
const localEdit = {
  ...createEmptyState(),
  tasks: [task({ id: "y", title: "옛제목", memo: "pc" })],
};
const remoteEdit = {
  ...createEmptyState(),
  tasks: [task({ id: "y", title: "새제목", memo: "phone" })],
};
const fieldRemote = mergeAppStates(localEdit, remoteEdit, "remote");
ok("prefer remote title", fieldRemote.tasks[0]?.title === "새제목");

// --- mergeForSync shouldPush when local unique ---
const sync = mergeForSync({
  local,
  remote,
  localUpdatedAt: "2026-10-17T10:00:00.000Z",
  remoteUpdatedAt: "2026-10-17T09:00:00.000Z",
});
ok("shouldPush when union differs", sync.shouldPush === true);
ok(
  "merged has both",
  sync.merged.tasks.length === 2,
);
ok(
  "fingerprint differs from remote",
  fingerprintState(sync.merged) !== fingerprintState(remote),
);

// remote-only newer, local empty extras identical remote → no push if local subset?
const onlyRemote = mergeForSync({
  local: createEmptyState(),
  remote,
  localUpdatedAt: "2026-10-17T08:00:00.000Z",
  remoteUpdatedAt: "2026-10-17T09:00:00.000Z",
});
ok(
  "empty local + remote → merged equals remote, no push",
  onlyRemote.shouldPush === false &&
    fingerprintState(onlyRemote.merged) === fingerprintState(remote),
);

// --- delete tombstone: local deleted, remote still has row → stays gone ---
const deletedAt = "2026-10-18T12:00:00.000Z";
const localAfterDelete: AppState = {
  ...createEmptyState(),
  tasks: [task({ id: "keep", title: "남김" })],
  deletions: { gone: deletedAt },
};
const remoteStillHas: AppState = {
  ...createEmptyState(),
  tasks: [
    task({ id: "keep", title: "남김" }),
    task({ id: "gone", title: "삭제된줄" }),
  ],
};
const afterDeleteMerge = mergeAppStates(localAfterDelete, remoteStillHas, "remote");
ok(
  "tombstone blocks resurrection from remote",
  afterDeleteMerge.tasks.length === 1 &&
    afterDeleteMerge.tasks[0]?.id === "keep" &&
    afterDeleteMerge.deletions.gone === deletedAt,
);

const deleteSync = mergeForSync({
  local: localAfterDelete,
  remote: remoteStillHas,
  localUpdatedAt: "2026-10-18T12:00:01.000Z",
  remoteUpdatedAt: "2026-10-18T11:00:00.000Z",
});
ok(
  "delete merge should push (remote still has deleted id)",
  deleteSync.shouldPush === true &&
    !deleteSync.merged.tasks.some((t) => t.id === "gone"),
);

// peer tombstone drops local copy
const peerDeleted: AppState = {
  ...createEmptyState(),
  deletions: { x: "2026-10-18T15:00:00.000Z" },
};
const localHasX: AppState = {
  ...createEmptyState(),
  tasks: [task({ id: "x", title: "아직있음" })],
};
const peerWinsDelete = mergeAppStates(localHasX, peerDeleted, "local");
ok(
  "peer tombstone drops local item",
  peerWinsDelete.tasks.length === 0 &&
    Boolean(peerWinsDelete.deletions.x),
);

// unique sibling still unioned alongside tombstone
const mixed = mergeAppStates(
  {
    ...createEmptyState(),
    tasks: [task({ id: "a", title: "PC" })],
    deletions: { z: deletedAt },
  },
  {
    ...createEmptyState(),
    tasks: [
      task({ id: "b", title: "폰" }),
      task({ id: "z", title: "옛줄" }),
    ],
  },
  "remote",
);
ok(
  "union + tombstone together",
  mixed.tasks.length === 2 &&
    mixed.tasks.some((t) => t.id === "a") &&
    mixed.tasks.some((t) => t.id === "b") &&
    !mixed.tasks.some((t) => t.id === "z"),
);

console.log("smoke-sync-merge: all passed");
