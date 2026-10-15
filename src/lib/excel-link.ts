/**
 * File System Access API — 기기(브라우저)마다 엑셀 파일을 한 번 고르면
 * 이후 「엑셀 파일 저장」은 같은 파일을 덮어씁니다.
 *
 * 중요: 저장된 핸들이 있을 때 덮어쓰기 실패 → 피커/다운로드로 떨어지지 않음.
 * 피커는 (1) 핸들 없음 첫 저장 (2) 「다른 이름으로 저장」만.
 */

import { downloadXlsx } from "./excel";
import {
  classifyExcelWriteError,
  excelSaveToastMessage,
  resolveSaveStrategy,
  type ExcelSaveResult,
  type ExcelWriteErrorKind,
} from "./excel-save-policy";

export type { ExcelSaveResult, ExcelWriteErrorKind };
export {
  classifyExcelWriteError,
  excelSaveToastMessage,
  resolveSaveStrategy,
};

const DB_NAME = "ilbiseo-fs";
const STORE = "handles";
const KEY = "excel";
const META_KEY = "ilbiseo-excel-link-meta-v1";

export const DEFAULT_EXCEL_NAME = "일비서.xlsx";

type ExcelLinkMeta = {
  fileName: string;
  updatedAt: string;
};

/** Session cache — avoids IDB flakes within one tab lifetime */
let memoryHandle: FileSystemFileHandle | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function readMeta(): ExcelLinkMeta | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExcelLinkMeta;
    if (!parsed?.fileName) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeMeta(fileName: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const meta: ExcelLinkMeta = {
      fileName,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore quota / private mode */
  }
}

function clearMeta(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    /* ignore */
  }
}

export function getExcelLinkMeta(): ExcelLinkMeta | null {
  return readMeta();
}

export async function saveExcelHandle(
  handle: FileSystemFileHandle,
): Promise<void> {
  memoryHandle = handle;
  writeMeta(handle.name || DEFAULT_EXCEL_NAME);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB put failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB put aborted"));
    });
  } finally {
    db.close();
  }
}

export async function loadExcelHandle(): Promise<FileSystemFileHandle | null> {
  if (memoryHandle) return memoryHandle;
  try {
    const db = await openDb();
    try {
      const handle = await new Promise<FileSystemFileHandle | null>(
        (resolve, reject) => {
          const tx = db.transaction(STORE, "readonly");
          const req = tx.objectStore(STORE).get(KEY);
          req.onsuccess = () => {
            const value = req.result;
            resolve(
              value && typeof value === "object"
                ? (value as FileSystemFileHandle)
                : null,
            );
          };
          req.onerror = () =>
            reject(req.error ?? new Error("IndexedDB get failed"));
        },
      );
      if (handle) {
        memoryHandle = handle;
        if (!readMeta()?.fileName) {
          writeMeta(handle.name || DEFAULT_EXCEL_NAME);
        }
      }
      return handle;
    } finally {
      db.close();
    }
  } catch {
    return memoryHandle;
  }
}

export async function clearExcelHandle(): Promise<void> {
  memoryHandle = null;
  clearMeta();
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () =>
          reject(tx.error ?? new Error("IndexedDB delete failed"));
      });
    } finally {
      db.close();
    }
  } catch {
    /* still cleared memory + meta */
  }
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
  if (buffer instanceof ArrayBuffer) return buffer.slice(0);
  const view = buffer;
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
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
      if (current === "denied") return false;
    }
    if (typeof handle.requestPermission !== "function") return true;
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
    throw Object.assign(
      new Error(
        "엑셀 파일 쓰기 권한이 없습니다. 「다른 이름으로 저장」으로 다시 골라 주세요.",
      ),
      { name: "NotAllowedError" },
    );
  }
  const writable = await handle.createWritable();
  try {
    await writable.write(toArrayBuffer(buffer));
    await writable.close();
  } catch (e) {
    try {
      await writable.abort();
    } catch {
      /* ignore abort failure */
    }
    throw e;
  }
  // Refresh persistence after a successful write
  try {
    await saveExcelHandle(handle);
  } catch {
    memoryHandle = handle;
    writeMeta(handle.name || DEFAULT_EXCEL_NAME);
  }
}

/**
 * 첫 저장: 위치·이름 선택 → 핸들 IndexedDB(+메모리·localStorage 메타) 보관.
 * 이후 저장: 같은 파일 createWritable 덮어쓰기. 실패해도 피커로 떨어지지 않음.
 * FS Access 없음: 다운로드 폴백.
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
  const forceNewFile = Boolean(options?.forceNewFile);

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

  const existing = forceNewFile ? null : await loadExcelHandle();
  const strategy = resolveSaveStrategy({
    forceNewFile,
    hasStoredHandle: Boolean(existing),
  });

  if (strategy === "overwrite" && existing) {
    try {
      await writeBufferToHandle(existing, data);
      return {
        mode: "overwrite",
        fileName: existing.name || readMeta()?.fileName || suggestedName,
      };
    } catch (e) {
      const { kind, message } = classifyExcelWriteError(e);
      // Stale handle only: drop it so UI shows "not linked", but still NO auto-picker
      if (kind === "not_found") {
        await clearExcelHandle();
      }
      return {
        mode: "error",
        kind,
        message,
        fileName: existing.name || readMeta()?.fileName,
      };
    }
  }

  // Picker ONLY: first save (no handle) or explicit 「다른 이름으로 저장」
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
    try {
      await writeBufferToHandle(handle, data);
      return { mode: "created", fileName: handle.name || suggestedName };
    } catch (e) {
      // Handle already stored by pickExcelFile — keep it for next overwrite
      const { kind, message } = classifyExcelWriteError(e);
      return {
        mode: "error",
        kind,
        message,
        fileName: handle.name || suggestedName,
      };
    }
  } catch (e) {
    if (isAbortError(e)) return { mode: "cancelled" };
    throw e;
  }
}

/** @internal test helper — reset module cache between tests */
export function __resetExcelLinkMemoryForTests(): void {
  memoryHandle = null;
}
