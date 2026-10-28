/**
 * Similarity alert copy includes 틀 · 행 · 겹친 말.
 */
import {
  buildSimilarityAlertMessage,
  findSimilarActiveTasks,
  orderInFrame,
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

const peers: Task[] = [
  task({
    id: "a",
    title: "팀 회의 준비 자료",
    category: "team",
    createdAt: "2026-10-28T10:00:00.000Z",
  }),
  task({
    id: "b",
    title: "다른 일",
    category: "work",
    createdAt: "2026-10-27T00:00:00.000Z",
  }),
  task({
    id: "c",
    title: "팀 회의 일정 확인",
    category: "team",
    createdAt: "2026-10-26T00:00:00.000Z",
  }),
];

const hits = findSimilarActiveTasks(
  { title: "팀 회의 준비하기", memo: "" },
  peers,
);
ok("hit-found", hits.length >= 1, hits.map((h) => h.task.title));
ok(
  "shared-tokens",
  hits[0].sharedTokens.includes("회의") ||
    hits[0].sharedTokens.length >= 2,
  hits[0].sharedTokens,
);

const order = orderInFrame(hits[0].task, peers);
ok("order-in-frame-positive", order >= 1, order);

const msg = buildSimilarityAlertMessage(hits, peers);
ok("msg-has-frame", Boolean(msg && msg.includes("팀원용")), msg);
ok("msg-has-row", Boolean(msg && /\d+번 행/.test(msg)), msg);
ok("msg-has-overlap", Boolean(msg && msg.includes("겹친 말")), msg);
ok("msg-has-title", Boolean(msg && msg.includes("팀 회의")), msg);

console.log(JSON.stringify({ msg, order, shared: hits[0].sharedTokens }, null, 2));
