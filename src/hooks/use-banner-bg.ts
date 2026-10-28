"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultSrcForSlot,
  loadBannerBgBlob,
  loadBannerBgMeta,
  resetBannerBg,
  saveBannerBg,
  saveBannerBgBoth,
  type BannerBgMeta,
  type BannerBgSlot,
} from "@/lib/banner-bg";

export type BannerBgUrls = {
  mobile: string;
  pc: string;
};

type UseBannerBgResult = {
  ready: boolean;
  meta: BannerBgMeta;
  urls: BannerBgUrls;
  busy: boolean;
  error: string | null;
  setFromFile: (
    slot: BannerBgSlot | "both",
    file: File,
  ) => Promise<void>;
  reset: (slot: BannerBgSlot | "all") => Promise<void>;
  clearError: () => void;
};

async function blobUrlForSlot(
  slot: BannerBgSlot,
  custom: boolean,
): Promise<string> {
  if (!custom) return defaultSrcForSlot(slot);
  const blob = await loadBannerBgBlob(slot);
  if (!blob) return defaultSrcForSlot(slot);
  return URL.createObjectURL(blob);
}

/**
 * Loads custom banner backgrounds from IndexedDB (this device).
 * Revokes previous object URLs when replaced.
 */
export function useBannerBg(): UseBannerBgResult {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<BannerBgMeta>(() =>
    typeof window === "undefined"
      ? { mobile: false, pc: false, updatedAt: null }
      : loadBannerBgMeta(),
  );
  const [urls, setUrls] = useState<BannerBgUrls>({
    mobile: defaultSrcForSlot("mobile"),
    pc: defaultSrcForSlot("pc"),
  });
  const urlsRef = useRef(urls);
  urlsRef.current = urls;

  const revokeIfBlob = useCallback((url: string) => {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }, []);

  const refresh = useCallback(async () => {
    const nextMeta = loadBannerBgMeta();
    const [mobile, pc] = await Promise.all([
      blobUrlForSlot("mobile", nextMeta.mobile),
      blobUrlForSlot("pc", nextMeta.pc),
    ]);
    const prev = urlsRef.current;
    setMeta(nextMeta);
    setUrls({ mobile, pc });
    if (prev.mobile !== mobile) revokeIfBlob(prev.mobile);
    if (prev.pc !== pc) revokeIfBlob(prev.pc);
  }, [revokeIfBlob]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      const cur = urlsRef.current;
      revokeIfBlob(cur.mobile);
      revokeIfBlob(cur.pc);
    };
  }, [refresh, revokeIfBlob]);

  const setFromFile = useCallback(
    async (slot: BannerBgSlot | "both", file: File) => {
      setBusy(true);
      setError(null);
      try {
        if (slot === "both") {
          await saveBannerBgBoth(file);
        } else {
          await saveBannerBg(slot, file);
        }
        await refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "사진을 넣지 못했습니다.",
        );
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const reset = useCallback(
    async (slot: BannerBgSlot | "all") => {
      setBusy(true);
      setError(null);
      try {
        await resetBannerBg(slot);
        await refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "기본 사진으로 돌리지 못했습니다.",
        );
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return {
    ready,
    meta,
    urls,
    busy,
    error,
    setFromFile,
    reset,
    clearError: () => setError(null),
  };
}
