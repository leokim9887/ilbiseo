import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type SyncRecord = {
  ciphertext: string;
  iv: string;
  updatedAt: string;
};

const KEY_PREFIX = "ilbiseo:device-sync:";

function redisKey(codeHash: string): string {
  return `${KEY_PREFIX}${codeHash.toLowerCase()}`;
}

function localPath(codeHash: string): string {
  return path.join(
    process.cwd(),
    ".data",
    "device-sync",
    `${codeHash.toLowerCase()}.json`,
  );
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

export function syncStoreMode(): "upstash" | "local-file" | "none" {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return "upstash";
  }
  if (process.env.VERCEL === "1") return "none";
  return "local-file";
}

async function upstashGet(codeHash: string): Promise<SyncRecord | null> {
  const json = await upstashCommand(["GET", redisKey(codeHash)]);
  if (!json || json.result == null) return null;
  try {
    return JSON.parse(String(json.result)) as SyncRecord;
  } catch {
    return null;
  }
}

async function upstashSet(
  codeHash: string,
  record: SyncRecord,
): Promise<boolean> {
  const json = await upstashCommand([
    "SET",
    redisKey(codeHash),
    JSON.stringify(record),
  ]);
  return Boolean(json);
}

async function localGet(codeHash: string): Promise<SyncRecord | null> {
  try {
    const raw = await readFile(localPath(codeHash), "utf8");
    return JSON.parse(raw) as SyncRecord;
  } catch {
    return null;
  }
}

async function localSet(
  codeHash: string,
  record: SyncRecord,
): Promise<boolean> {
  try {
    const file = localPath(codeHash);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(record), "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function loadSyncRecord(
  codeHash: string,
): Promise<SyncRecord | null> {
  if (syncStoreMode() === "upstash") {
    const fromRedis = await upstashGet(codeHash);
    if (fromRedis) return fromRedis;
  }
  if (process.env.VERCEL === "1") return null;
  return localGet(codeHash);
}

export async function saveSyncRecord(
  codeHash: string,
  record: SyncRecord,
): Promise<{ ok: boolean; store: string; message: string }> {
  const mode = syncStoreMode();
  if (mode === "upstash") {
    const ok = await upstashSet(codeHash, record);
    return {
      ok,
      store: "upstash",
      message: ok
        ? "동기화 저장소를 갱신했습니다."
        : "Upstash 저장에 실패했습니다.",
    };
  }
  if (mode === "local-file") {
    const ok = await localSet(codeHash, record);
    return {
      ok,
      store: "local-file",
      message: ok
        ? "로컬 동기화 파일을 저장했습니다."
        : "로컬 동기화 저장에 실패했습니다.",
    };
  }
  return {
    ok: false,
    store: "none",
    message:
      "서버 저장소가 없습니다. Vercel에 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN을 넣으세요.",
  };
}
