/**
 * File System Access API — 아버지 PC에서 엑셀 파일을 한 번 연결하면
 * 이후 저장 시 같은 파일을 덮어씁니다.
 * 클라우드 VM에서는 아버지 노트북 디스크에 쓸 수 없습니다.
 */

const DB_NAME = "ilbiseo-fs";
const STORE = "handles";
const KEY = "excel";

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

export async function pickExcelFile(): Promise<FileSystemFileHandle | null> {
  const picker = window.showSaveFilePicker;
  if (!picker) return null;
  const handle = await picker({
    suggestedName: "일비서.xlsx",
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
  const permission = await handle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("엑셀 파일 쓰기 권한이 없습니다. 다시 연결해 주세요.");
  }
  const writable = await handle.createWritable();
  const data =
    buffer instanceof ArrayBuffer
      ? buffer
      : buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        );
  await writable.write(data as ArrayBuffer);
  await writable.close();
}
