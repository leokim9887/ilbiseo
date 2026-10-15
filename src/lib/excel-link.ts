/**
 * File System Access API — 아버지 PC에서 엑셀을 한 번 저장하면
 * 이후 「엑셀 파일 저장」은 같은 파일을 덮어씁니다.
 * 핸들은 IndexedDB에 보관(Chrome/Edge). Safari·모바일은 다운로드 폴백.
 */

import { downloadXlsx } from "./excel";

const DB_NAME = "ilbiseo-fs";
const STORE = "handles";
const KEY = "excel";

export const DEFAULT_EXCEL_NAME = "일비서.xlsx";

export type ExcelSaveResult =
  | { mode: "overwrite"; fileName: string }
  | { mode: "created"; fileName: string }
  | {
      mode: "download";
      fileName: string;
      reason: "unsupported" | "fallback";
    }
  | { mode: "cancelled" };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveExcelHandle(
  handle: FileSystemFileHandle,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadExcelHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb();
    const handle = await new Promise<FileSystemFileHandle | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () =>
          resolve((req.result as FileSystemFileHandle) ?? null);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function clearExcelHandle(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

function toArrayBuffer(
  buffer: ArrayBuffer | ArrayBufferView,
): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer;
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export async function ensureWritePermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  try {
    if (typeof handle.queryPermission === "function") {
      const current = await handle.queryPermission(opts);
      if (current === "granted") return true;
    }
    const next = await handle.requestPermission(opts);
    return next === "granted";
  } catch {
    return false;
  }
}

export async function pickExcelFile(
  suggestedName: string = DEFAULT_EXCEL_NAME,
): Promise<FileSystemFileHandle | null> {
  const picker = window.showSaveFilePicker;
  if (!picker) return null;
  const handle = await picker({
    suggestedName,
    types: [
      {
        description: "Excel",
        accept: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
            ".xlsx",
          ],
        },
      },
    ],
  });
  await saveExcelHandle(handle);
  return handle;
}

export async function writeBufferToHandle(
  handle: FileSystemFileHandle,
  buffer: ArrayBuffer | ArrayBufferView,
): Promise<void> {
  const ok = await ensureWritePermission(handle);
  if (!ok) {
    throw new Error(
      "엑셀 파일 쓰기 권한이 없습니다. 「다른 이름으로 저장」으로 다시 골라 주세요.",
    );
  }
  const writable = await handle.createWritable();
  await writable.write(toArrayBuffer(buffer));
  await writable.close();
}

/**
 * 첫 저장: 위치·이름 선택 → 핸들 IndexedDB 보관.
 * 이후 저장: 같은 파일 createWritable 덮어쓰기.
 * FS Access 없음(Safari·모바일 등): 다운로드 폴백.
 */
export async function saveExcelBuffer(
  buffer: ArrayBuffer | ArrayBufferView,
  options?: {
    /** true면 항상 새 위치 선택(다른 이름으로 저장) */
    forceNewFile?: boolean;
    suggestedName?: string;
    /** FS Access 없을 때 다운로드 (기본 true) */
    downloadFallback?: boolean;
  },
): Promise<ExcelSaveResult> {
  const suggestedName = options?.suggestedName ?? DEFAULT_EXCEL_NAME;
  const downloadFallback = options?.downloadFallback !== false;
  const data = toArrayBuffer(buffer);

  if (!supportsFileSystemAccess()) {
    if (!downloadFallback) {
      throw new Error(
        "같은 파일에 덮어쓰려면 PC의 Chrome 또는 Edge를 사용해 주세요.",
      );
    }
    downloadXlsx(data, suggestedName);
    return {
      mode: "download",
      fileName: suggestedName,
      reason: "unsupported",
    };
  }

  if (!options?.forceNewFile) {
    const existing = await loadExcelHandle();
    if (existing) {
      try {
        await writeBufferToHandle(existing, data);
        return { mode: "overwrite", fileName: existing.name || suggestedName };
      } catch {
        // 권한 만료·파일 이동 등 → 다시 고르기
      }
    }
  }

  try {
    const handle = await pickExcelFile(suggestedName);
    if (!handle) {
      if (downloadFallback) {
        downloadXlsx(data, suggestedName);
        return {
          mode: "download",
          fileName: suggestedName,
          reason: "fallback",
        };
      }
      return { mode: "cancelled" };
    }
    await writeBufferToHandle(handle, data);
    return { mode: "created", fileName: handle.name || suggestedName };
  } catch (e) {
    if (isAbortError(e)) return { mode: "cancelled" };
    throw e;
  }
}

/** 토스트용 짧은 한국어 메시지 */
export function excelSaveToastMessage(result: ExcelSaveResult): string | null {
  switch (result.mode) {
    case "overwrite":
      return "기존 파일에 저장했습니다";
    case "created":
      return `저장했습니다 · ${result.fileName}`;
    case "download":
      return result.reason === "unsupported"
        ? "다운로드로 저장했습니다. 같은 파일에 덮어쓰려면 PC Chrome·Edge를 써 주세요"
        : "다운로드로 저장했습니다";
    case "cancelled":
      return null;
  }
}
