/**
 * Session/work-unit dismiss for similar alerts:
 * ignore → same peer cluster stays quiet; switch work task → reset.
 */
import {
  dismissSimilarityPeers,
  findSimilarActiveTasks,
  isSimilarityClusterDismissed,
  similarityClusterKey,
} from "../src/lib/text-similarity";
import type { Task } from "../src/lib/types";

function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exit(1);
  }
  console.log("ok", name, detail ?? "");
}

function task(p: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "work",
    kind: "spot",
    startDate: "2026-10-28",
    targetDate: "2026-10-28",
    urgency: 1,
    importance: 2,
    groupKey: "g",
    memo: "",
    source: "manual",
    status: "active",
    createdAt: "2026-10-28T00:00:00.000Z",
    completedAt: null,
    ...p,
  };
}

const peerMeeting = task({
  id: "peer-meeting",
  title: "팀 회의 준비 자료",
  category: "team",
});
const peerOther = task({
  id: "peer-other",
  title: "세금 신고 서류 정리",
  category: "personal",
});
const peers: Task[] = [peerMeeting, peerOther];

const hitsA = findSimilarActiveTasks(
  { title: "팀 회의 준비하기", memo: "" },
  peers,
  "draft-1",
);
ok("hits-meeting", hitsA.length >= 1 && hitsA[0].task.id === "peer-meeting", {
  ids: hitsA.map((h) => h.task.id),
  shared: hitsA[0]?.sharedTokens,
});

const keyA = similarityClusterKey(hitsA);
ok("cluster-key-stable", keyA === "peer-meeting", keyA);

// Same peers after slight wording change → same cluster
const hitsA2 = findSimilarActiveTasks(
  { title: "팀 회의 준비 자료 작성", memo: "" },
  peers,
  "draft-1",
);
ok(
  "cluster-key-same-after-edit",
  similarityClusterKey(hitsA2) === keyA,
  similarityClusterKey(hitsA2),
);

const dismissed = new Set<string>();
ok(
  "not-dismissed-yet",
  !isSimilarityClusterDismissed(hitsA, dismissed),
);

dismissSimilarityPeers(hitsA, dismissed);
ok(
  "dismissed-after-ignore",
  isSimilarityClusterDismissed(hitsA, dismissed),
);
ok(
  "still-dismissed-after-edit",
  isSimilarityClusterDismissed(hitsA2, dismissed),
);

// Work-unit reset (다른 일정으로 전환)
const dismissedAfterSwitch = new Set<string>();
ok(
  "reset-on-work-switch",
  !isSimilarityClusterDismissed(hitsA, dismissedAfterSwitch),
);

const hitsTax = findSimilarActiveTasks(
  { title: "세금 신고 서류 준비", memo: "" },
  peers,
  "draft-2",
);
ok("hits-tax", hitsTax.length >= 1 && hitsTax[0].task.id === "peer-other", {
  ids: hitsTax.map((h) => h.task.id),
});
ok(
  "other-work-not-suppressed-by-previous-dismiss",
  !isSimilarityClusterDismissed(hitsTax, dismissed),
  { dismissed: [...dismissed], taxPeers: hitsTax.map((h) => h.task.id) },
);

dismissSimilarityPeers(hitsTax, dismissedAfterSwitch);
ok(
  "tax-dismissed-in-new-unit",
  isSimilarityClusterDismissed(hitsTax, dismissedAfterSwitch),
);

console.log(
  JSON.stringify(
    {
      keyA,
      dismissedMeeting: [...dismissed],
      taxKey: similarityClusterKey(hitsTax),
    },
    null,
    2,
  ),
);
