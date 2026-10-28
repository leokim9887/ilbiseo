/**
 * Custom top-banner background photos (father settings).
 * Stored in IndexedDB on this device only — not part of PC↔폰 workbook sync
 * (blobs are too large; overlays stay fixed in the app).
 */

export type BannerBgSlot = "mobile" | "pc";

export const BANNER_BG_META_KEY = "ilbiseo-banner-bg-meta-v1";
export const DEFAULT_BANNER_MOBILE = "/ilbiseo-family-banner-mobile.jpg?v=35";
export const DEFAULT_BANNER_PC = "/ilbiseo-family-banner-pc.jpg?v=35";

const DB_NAME = "ilbiseo-banner-bg";
const DB_VERSION = 1;
const STORE = "images";

/** Soft cap so fathers’ phone photos stay under typical IndexedDB comfort. */
const MAX_EDGE_PX = 1920;
const JPEG_QUALITY = 0.82;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

export type BannerBgMeta = {
  mobile: boolean;
  pc: boolean;
  updatedAt: string | null;
};

export function defaultBannerBgMeta(): BannerBgMeta {
  return { mobile: false, pc: false, updatedAt: null };
}

export function loadBannerBgMeta(): BannerBgMeta {
  if (typeof window === "undefined") return defaultBannerBgMeta();
  try {
    const raw = localStorage.getItem(BANNER_BG_META_KEY);
    if (!raw) return defaultBannerBgMeta();
    const parsed = JSON.parse(raw) as Partial<BannerBgMeta>;
    return {
      mobile: Boolean(parsed.mobile),
      pc: Boolean(parsed.pc),
      updatedAt: parsed.updatedAt ? String(parsed.updatedAt) : null,
    };
  } catch {
    return defaultBannerBgMeta();
  }
}

function writeBannerBgMeta(meta: BannerBgMeta): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BANNER_BG_META_KEY, JSON.stringify(meta));
  } catch {
    /* private mode / quota */
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("배너 사진 저장소를 열지 못했습니다."));
  });
}

async function idbPut(slot: BannerBgSlot, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("배너 사진을 저장하지 못했습니다."));
      tx.onabort = () =>
        reject(tx.error ?? new Error("배너 사진 저장이 취소되었습니다."));
    });
  } finally {
    db.close();
  }
}

async function idbGet(slot: BannerBgSlot): Promise<Blob | null> {
  const db = await openDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(slot);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v instanceof Blob ? v : null);
      };
      req.onerror = () =>
        reject(req.error ?? new Error("배너 사진을 불러오지 못했습니다."));
    });
  } finally {
    db.close();
  }
}

async function idbDelete(slot: BannerBgSlot): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("배너 사진을 지우지 못했습니다."));
    });
  } finally {
    db.close();
  }
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이 파일을 사진으로 열 수 없습니다."));
    };
    img.src = url;
  });
}

/** Downscale + JPEG encode so storage stays small and overlays stay sharp. */
export async function prepareBannerImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("사진 파일만 고를 수 있습니다.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("사진이 너무 큽니다. 12MB 이하로 골라 주세요.");
  }

  const img = await loadImageFromFile(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("사진 크기를 읽지 못했습니다.");

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("사진을 처리할 수 없습니다.");
  ctx.drawImage(img, 0, 0, tw, th);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("사진을 저장용으로 바꾸지 못했습니다.");
  return blob;
}

export async function saveBannerBg(
  slot: BannerBgSlot,
  file: File,
): Promise<BannerBgMeta> {
  const blob = await prepareBannerImage(file);
  await idbPut(slot, blob);
  const meta = loadBannerBgMeta();
  const next: BannerBgMeta = {
    ...meta,
    [slot]: true,
    updatedAt: new Date().toISOString(),
  };
  writeBannerBgMeta(next);
  return next;
}

export async function saveBannerBgBoth(file: File): Promise<BannerBgMeta> {
  const blob = await prepareBannerImage(file);
  await idbPut("mobile", blob);
  await idbPut("pc", blob);
  const next: BannerBgMeta = {
    mobile: true,
    pc: true,
    updatedAt: new Date().toISOString(),
  };
  writeBannerBgMeta(next);
  return next;
}

export async function resetBannerBg(
  slot: BannerBgSlot | "all",
): Promise<BannerBgMeta> {
  if (slot === "all") {
    await idbDelete("mobile");
    await idbDelete("pc");
    const next = defaultBannerBgMeta();
    writeBannerBgMeta(next);
    return next;
  }
  await idbDelete(slot);
  const meta = loadBannerBgMeta();
  const next: BannerBgMeta = {
    ...meta,
    [slot]: false,
    updatedAt: new Date().toISOString(),
  };
  if (!next.mobile && !next.pc) next.updatedAt = null;
  writeBannerBgMeta(next);
  return next;
}

export async function loadBannerBgBlob(
  slot: BannerBgSlot,
): Promise<Blob | null> {
  try {
    return await idbGet(slot);
  } catch {
    return null;
  }
}

export function defaultSrcForSlot(slot: BannerBgSlot): string {
  return slot === "mobile" ? DEFAULT_BANNER_MOBILE : DEFAULT_BANNER_PC;
}
