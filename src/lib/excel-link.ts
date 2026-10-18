/**
 * File System Access API — 기기(브라우저)마다 엑셀 파일을 한 번 고르면
 * 이후 「엑셀 파일 저장」은 같은 파일을 덮어씁니다.
 *
 * 중요: 저장된 핸들이 있을 때 덮어쓰기 실패 → 피커/다운로드로 떨어지지 않음.
 * 피커는 (1) 핸들 없음 첫 저장 (2) 「다른 이름으로 저장」만.
 */

import { downloadXlsx } from "./excel";
import { datedExcelFilename } from "./excel-filename";
import {
  classifyExcelWriteError,
  excelSaveToastMessage,
  needsDatedExcelRename,
  resolveSaveStrategy,
  type ExcelSaveResult,
  type ExcelWriteErrorKind,
} from "./excel-save-policy";

export type { ExcelSaveResult, ExcelWriteErrorKind };
export {
  classifyExcelWriteError,
  excelSaveToastMessage,
  needsDatedExcelRename,
  resolveSaveStrategy,
};
export { datedExcelFilename };

const DB_NAME = "ilbiseo-fs";
const STORE = "handles";
const KEY = "excel";
const META_KEY = "ilbiseo-excel-link-meta-v1";

/** Legacy undated name (pre–dated-filename). Prefer datedExcelFilename(). */
export const LEGACY_EXCEL_NAME = "일비서.xlsx";

/** @deprecated use datedExcelFilename() at call time (KST midnight must roll). */
export const DEFAULT_EXCEL_NAME = LEGACY_EXCEL_NAME;

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
  writeMeta(handle.name || datedExcelFilename());
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
          writeMeta(handle.name || datedExcelFilename());
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

/**
 * Rename the linked file in place (Chrome/Edge File System Access `move`).
 * Updates memory + IndexedDB meta so Explorer shows the new dated name.
 */
export async function renameExcelHandle(
  handle: FileSystemFileHandle,
  newName: string,
): Promise<FileSystemFileHandle> {
  if (!newName || handle.name === newName) return handle;
  const ok = await ensureWritePermission(handle);
  if (!ok) {
    throw Object.assign(
      new Error("파일 이름 바꾸기 권한이 없습니다."),
      { name: "NotAllowedError" },
    );
  }
  if (typeof handle.move !== "function") {
    throw Object.assign(new Error("이 브라우저는 파일 이름 바꾸기를 지원하지 않습니다."), {
      name: "NotSupportedError",
    });
  }
  await handle.move(newName);
  await saveExcelHandle(handle);
  return handle;
}

export async function pickExcelFile(
  suggestedName: string = datedExcelFilename(),
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
  // Fully materialize bytes first — never stream a partial workbook.
  const data = toArrayBuffer(buffer);
  if (data.byteLength < 32) {
    throw new Error("엑셀 데이터가 비어 있어 저장하지 않았습니다.");
  }
  /**
   * keepExistingData: true — avoid truncating to 0 before the write succeeds.
   * Default createWritable() truncates immediately; a failed mid-write left a
   * 0-byte / half-written .xlsx that Excel reports as「이 파일에 오류가 생겼습니다」.
   */
  const writable = await handle.createWritable({ keepExistingData: true });
  try {
    await writable.write({ type: "write", position: 0, data });
    await writable.truncate(data.byteLength);
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
    writeMeta(handle.name || datedExcelFilename());
  }
}

/**
 * 첫 저장: 위치·이름 선택(오늘 KST 날짜 포함) → 핸들 보관.
 * 이후 저장: 같은 핸들 덮어쓰기. 날짜가 바뀌면 move()로 이름 갱신 후 쓰기.
 * move 불가 시(구형 브라우저)만 새 날짜 이름으로 피커 → 핸들 교체.
 * 쓰기 실패 시에는 피커로 떨어지지 않음(덮어쓰기 신뢰성 유지).
 * FS Access 없음: 다운로드 폴백(날짜 이름).
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
  const suggestedName = options?.suggestedName ?? datedExcelFilename();
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
      let handle = existing;
      if (needsDatedExcelRename(existing.name, suggestedName)) {
        try {
          handle = await renameExcelHandle(existing, suggestedName);
        } catch {
          // Cannot rename in place — open dated save-as once so Explorer
          // shows today’s name (not stuck on 일비서.xlsx / yesterday).
          try {
            const picked = await pickExcelFile(suggestedName);
            if (!picked) {
              // Father cancelled rename picker — still overwrite old name
              // so data is not lost.
              await writeBufferToHandle(existing, data);
              return {
                mode: "overwrite",
                fileName:
                  existing.name || readMeta()?.fileName || suggestedName,
              };
            }
            handle = picked;
            await writeBufferToHandle(handle, data);
            return {
              mode: "created",
              fileName: handle.name || suggestedName,
            };
          } catch (pickErr) {
            if (isAbortError(pickErr)) {
              await writeBufferToHandle(existing, data);
              return {
                mode: "overwrite",
                fileName:
                  existing.name || readMeta()?.fileName || suggestedName,
              };
            }
            throw pickErr;
          }
        }
      }
      await writeBufferToHandle(handle, data);
      return {
        mode: "overwrite",
        fileName: handle.name || readMeta()?.fileName || suggestedName,
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
