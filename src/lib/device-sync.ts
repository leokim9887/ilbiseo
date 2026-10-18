import type { AppState } from "./types";
import { normalizeState } from "./storage";
import {
  decryptJson,
  encryptJson,
  generateSyncCode,
  hashSyncCode,
  isValidSyncCode,
  normalizeSyncCode,
  type EncryptedBlob,
} from "./sync-crypto";

export const DEVICE_SYNC_KEY = "ilbiseo-device-sync-v1";

export type DeviceSyncPrefs = {
  enabled: boolean;
  code: string;
  /** Last successful server sync time (ISO) */
  lastSyncedAt: string | null;
  /** Local workbook revision time used for LWW */
  localUpdatedAt: string | null;
};

export type SyncPullResult =
  | { status: "empty" }
  | { status: "same"; updatedAt: string }
  /** Remote blob decrypted — caller must merge with local (not blind replace). */
  | { status: "remote"; state: AppState; updatedAt: string }
  | { status: "error"; message: string };

export type SyncPushResult =
  | { status: "ok"; updatedAt: string }
  | { status: "conflict"; state: AppState; updatedAt: string }
  | { status: "error"; message: string };

export function createDefaultSyncPrefs(): DeviceSyncPrefs {
  return {
    enabled: false,
    code: "",
    lastSyncedAt: null,
    localUpdatedAt: null,
  };
}

export function loadSyncPrefs(): DeviceSyncPrefs {
  if (typeof window === "undefined") return createDefaultSyncPrefs();
  try {
    const raw = localStorage.getItem(DEVICE_SYNC_KEY);
    if (!raw) return createDefaultSyncPrefs();
    const parsed = JSON.parse(raw) as Partial<DeviceSyncPrefs>;
    const code = parsed.code ? normalizeSyncCode(String(parsed.code)) : "";
    return {
      enabled: Boolean(parsed.enabled) && isValidSyncCode(code),
      code,
      lastSyncedAt: parsed.lastSyncedAt ? String(parsed.lastSyncedAt) : null,
      localUpdatedAt: parsed.localUpdatedAt
        ? String(parsed.localUpdatedAt)
        : null,
    };
  } catch {
    return createDefaultSyncPrefs();
  }
}

export function saveSyncPrefs(prefs: DeviceSyncPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEVICE_SYNC_KEY, JSON.stringify(prefs));
}

export { generateSyncCode, isValidSyncCode, normalizeSyncCode };

type SyncPayload = {
  state: AppState;
  updatedAt: string;
};

async function fetchRemote(
  codeHash: string,
): Promise<
  | { empty: true }
  | { empty: false; blob: EncryptedBlob; updatedAt: string }
  | { error: string }
> {
  const res = await fetch(`/api/sync?codeHash=${encodeURIComponent(codeHash)}`, {
    cache: "no-store",
  });
  const json = (await res.json()) as {
    ok?: boolean;
    empty?: boolean;
    ciphertext?: string | null;
    iv?: string | null;
    updatedAt?: string | null;
    error?: string;
  };
  if (!res.ok || !json.ok) {
    return { error: json.error || "서버에서 불러오지 못했습니다." };
  }
  if (json.empty || !json.ciphertext || !json.iv || !json.updatedAt) {
    return { empty: true };
  }
  return {
    empty: false,
    blob: { ciphertext: json.ciphertext, iv: json.iv },
    updatedAt: json.updatedAt,
  };
}

export async function pullRemoteState(
  code: string,
  localUpdatedAt: string | null,
): Promise<SyncPullResult> {
  if (!isValidSyncCode(code)) {
    return { status: "error", message: "동기화 코드 형식이 올바르지 않습니다." };
  }
  try {
    const codeHash = await hashSyncCode(code);
    const remote = await fetchRemote(codeHash);
    if ("error" in remote) return { status: "error", message: remote.error };
    if (remote.empty) return { status: "empty" };

    // Same revision marker → skip decrypt. (Local edits bump localUpdatedAt,
    // so this only hits after a successful sync with no further edits.)
    if (localUpdatedAt && localUpdatedAt === remote.updatedAt) {
      return { status: "same", updatedAt: remote.updatedAt };
    }

    // Always decrypt when timestamps differ — even if local clock is ahead.
    // Blind "skipped-local-newer" used to drop sibling-only items forever.
    const payload = await decryptJson<SyncPayload>(code, remote.blob);
    const state = normalizeState(payload.state);
    if (!state) {
      return { status: "error", message: "원격 데이터를 해석하지 못했습니다." };
    }
    return {
      status: "remote",
      state,
      updatedAt: payload.updatedAt || remote.updatedAt,
    };
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error
          ? e.message
          : "동기화 코드를 확인하세요. 암호를 풀 수 없습니다.",
    };
  }
}

export async function pushLocalState(
  code: string,
  state: AppState,
  updatedAt: string,
): Promise<SyncPushResult> {
  if (!isValidSyncCode(code)) {
    return { status: "error", message: "동기화 코드 형식이 올바르지 않습니다." };
  }
  try {
    const codeHash = await hashSyncCode(code);
    const blob = await encryptJson(code, { state, updatedAt } satisfies SyncPayload);
    const res = await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        codeHash,
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        updatedAt,
      }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      conflict?: boolean;
      ciphertext?: string;
      iv?: string;
      updatedAt?: string;
      error?: string;
      message?: string;
    };

    if (res.status === 409 && json.conflict && json.ciphertext && json.iv) {
      try {
        const payload = await decryptJson<SyncPayload>(code, {
          ciphertext: json.ciphertext,
          iv: json.iv,
        });
        const remoteState = normalizeState(payload.state);
        if (remoteState) {
          return {
            status: "conflict",
            state: remoteState,
            updatedAt: payload.updatedAt || json.updatedAt || updatedAt,
          };
        }
      } catch {
        /* fall through */
      }
      return {
        status: "error",
        message: json.message || "충돌: 서버에 더 새 데이터가 있습니다.",
      };
    }

    if (!res.ok || !json.ok) {
      return {
        status: "error",
        message: json.error || json.message || "서버에 올리지 못했습니다.",
      };
    }

    return { status: "ok", updatedAt: json.updatedAt || updatedAt };
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "동기화 업로드 실패",
    };
  }
}
