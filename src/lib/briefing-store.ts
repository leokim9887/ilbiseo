import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { CalendarEvent, SideListItem, Task } from "./types";

export type BriefingSnapshot = {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  guidelines: SideListItem[];
  habits: SideListItem[];
  workEmail: string;
  dailyEmailEnabled: boolean;
  attachXlsx: boolean;
  updatedAt: string;
};

const SNAPSHOT_KEY = "ilbiseo:briefing-snapshot";

function localPath(): string {
  return path.join(process.cwd(), ".data", "briefing-snapshot.json");
}

async function upstashCommand(
  command: unknown[],
): Promise<{ result?: unknown } | null> {
  const base = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) return null;
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as { result?: unknown };
}

async function upstashGet(): Promise<BriefingSnapshot | null> {
  const json = await upstashCommand(["GET", SNAPSHOT_KEY]);
  if (!json || json.result == null) return null;
  try {
    return JSON.parse(String(json.result)) as BriefingSnapshot;
  } catch {
    return null;
  }
}

async function upstashSet(snapshot: BriefingSnapshot): Promise<boolean> {
  const json = await upstashCommand([
    "SET",
    SNAPSHOT_KEY,
    JSON.stringify(snapshot),
  ]);
  return Boolean(json);
}

async function localGet(): Promise<BriefingSnapshot | null> {
  try {
    const raw = await readFile(localPath(), "utf8");
    return JSON.parse(raw) as BriefingSnapshot;
  } catch {
    return null;
  }
}

async function localSet(snapshot: BriefingSnapshot): Promise<boolean> {
  try {
    await mkdir(path.dirname(localPath()), { recursive: true });
    await writeFile(localPath(), JSON.stringify(snapshot), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function snapshotStoreMode(): "upstash" | "local-file" | "none" {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return "upstash";
  }
  if (process.env.VERCEL === "1") return "none";
  return "local-file";
}

export async function saveBriefingSnapshot(
  snapshot: BriefingSnapshot,
): Promise<{ ok: boolean; store: string; message: string }> {
  const mode = snapshotStoreMode();
  if (mode === "upstash") {
    const ok = await upstashSet(snapshot);
    return {
      ok,
      store: "upstash",
      message: ok
        ? "Upstash에 브리핑 스냅샷을 저장했습니다."
        : "Upstash 저장에 실패했습니다.",
    };
  }
  if (mode === "local-file") {
    const ok = await localSet(snapshot);
    return {
      ok,
      store: "local-file",
      message: ok
        ? "로컬 .data에 브리핑 스냅샷을 저장했습니다."
        : "로컬 스냅샷 저장에 실패했습니다.",
    };
  }
  return {
    ok: false,
    store: "none",
    message:
      "서버 저장소가 없습니다. Vercel에서는 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN을 설정하세요. (크론 발송에 필요)",
  };
}

export async function loadBriefingSnapshot(): Promise<BriefingSnapshot | null> {
  const fromUpstash = await upstashGet();
  if (fromUpstash) return fromUpstash;
  if (process.env.VERCEL === "1") return null;
  return localGet();
}
