"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { AppState } from "@/lib/types";
import {
  loadSyncPrefs,
  pullRemoteState,
  pushLocalState,
  saveSyncPrefs,
  type DeviceSyncPrefs,
} from "@/lib/device-sync";

/** ~10 minutes while the app stays open (connected sync code). */
export const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;

/** Re-sync when tab becomes visible after this long hidden. */
const VISIBLE_RESYNC_AFTER_MS = 5 * 60 * 1000;

type SyncToast = {
  kind: "ok" | "error" | "info";
  text: string;
} | null;

type UseDeviceSyncArgs = {
  ready: boolean;
  state: AppState;
  localUpdatedAt: string | null;
  persistEpoch: number;
  skipRemotePushRef: MutableRefObject<boolean>;
  hydrateFromRemote: (state: AppState, updatedAt: string) => void;
};

/**
 * PC↔폰 동기화
 * - 로드 시 1회 quiet pull
 * - ~10분마다 quiet pull+push (편집마다 아님)
 * - 탭을 오래 숨겼다 다시 보이면 quiet 1회
 * - 「지금 동기화」만 토스트
 */
export function useDeviceSync({
  ready,
  state,
  localUpdatedAt,
  persistEpoch: _persistEpoch,
  skipRemotePushRef,
  hydrateFromRemote,
}: UseDeviceSyncArgs) {
  const [prefs, setPrefs] = useState<DeviceSyncPrefs>(() =>
    typeof window === "undefined"
      ? {
          enabled: false,
          code: "",
          lastSyncedAt: null,
          localUpdatedAt: null,
        }
      : loadSyncPrefs(),
  );
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<SyncToast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const localUpdatedAtRef = useRef(localUpdatedAt);
  const prefsRef = useRef(prefs);
  const pulledOnceRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);

  stateRef.current = state;
  localUpdatedAtRef.current = localUpdatedAt;
  prefsRef.current = prefs;

  const showToast = useCallback((next: SyncToast) => {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (next) {
      toastTimer.current = setTimeout(() => setToast(null), 3200);
    }
  }, []);

  const writePrefs = useCallback((next: DeviceSyncPrefs) => {
    prefsRef.current = next;
    setPrefs(next);
    saveSyncPrefs(next);
  }, []);

  /**
   * Quiet pull+push (LWW). No toast.
   * Used by: interval, visibility resume, initial seed path.
   */
  const runQuietRoundtrip = useCallback(
    async (opts?: { code?: string; pullOnly?: boolean }) => {
      const current = prefsRef.current;
      const code = opts?.code ?? current.code;
      if (!code) return;
      if (!opts?.code && !current.enabled) return;
      if (syncInFlightRef.current) return;
      if (skipRemotePushRef.current) {
        skipRemotePushRef.current = false;
      }
      syncInFlightRef.current = true;
      setBusy(true);
      try {
        const pull = await pullRemoteState(code, localUpdatedAtRef.current);
        if (pull.status === "applied") {
          hydrateFromRemote(pull.state, pull.updatedAt);
          writePrefs({
            ...prefsRef.current,
            lastSyncedAt: pull.updatedAt,
            localUpdatedAt: pull.updatedAt,
          });
          if (opts?.pullOnly) return;
          // After applying remote, local matches remote — skip push.
          return;
        }
        if (pull.status === "error") return;
        if (opts?.pullOnly) return;

        if (pull.status === "empty") {
          const updatedAt =
            localUpdatedAtRef.current ?? new Date().toISOString();
          const push = await pushLocalState(
            code,
            stateRef.current,
            updatedAt,
          );
          if (push.status === "ok") {
            writePrefs({
              ...prefsRef.current,
              lastSyncedAt: push.updatedAt,
              localUpdatedAt: push.updatedAt,
            });
          }
          return;
        }

        // same / skipped-local-newer → push local if needed
        const updatedAt =
          localUpdatedAtRef.current ?? new Date().toISOString();
        const push = await pushLocalState(
          code,
          stateRef.current,
          updatedAt,
        );
        if (push.status === "ok") {
          writePrefs({
            ...prefsRef.current,
            lastSyncedAt: push.updatedAt,
            localUpdatedAt: push.updatedAt,
          });
        } else if (push.status === "conflict") {
          hydrateFromRemote(push.state, push.updatedAt);
          writePrefs({
            ...prefsRef.current,
            lastSyncedAt: push.updatedAt,
            localUpdatedAt: push.updatedAt,
          });
        }
      } finally {
        syncInFlightRef.current = false;
        setBusy(false);
      }
    },
    [hydrateFromRemote, skipRemotePushRef, writePrefs],
  );

  /** Explicit 「지금 동기화」— toast only here. */
  const syncNow = useCallback(async () => {
    const current = prefsRef.current;
    if (!current.enabled || !current.code) {
      showToast({
        kind: "info",
        text: "먼저 동기화를 켜고 코드를 입력하세요",
      });
      return;
    }
    if (skipRemotePushRef.current) {
      skipRemotePushRef.current = false;
    }
    if (syncInFlightRef.current) {
      showToast({ kind: "info", text: "동기화 중입니다. 잠시만요." });
      return;
    }
    syncInFlightRef.current = true;
    setBusy(true);
    try {
      const pull = await pullRemoteState(
        current.code,
        localUpdatedAtRef.current,
      );
      if (pull.status === "applied") {
        hydrateFromRemote(pull.state, pull.updatedAt);
        writePrefs({
          ...prefsRef.current,
          lastSyncedAt: pull.updatedAt,
          localUpdatedAt: pull.updatedAt,
        });
        showToast({
          kind: "ok",
          text: "동기화됨 · 다른 기기 내용을 가져왔습니다",
        });
        return;
      }
      if (pull.status === "error") {
        showToast({ kind: "error", text: pull.message });
        return;
      }
      const updatedAt =
        localUpdatedAtRef.current ?? new Date().toISOString();
      const push = await pushLocalState(
        current.code,
        stateRef.current,
        updatedAt,
      );
      if (push.status === "ok") {
        writePrefs({
          ...prefsRef.current,
          lastSyncedAt: push.updatedAt,
          localUpdatedAt: push.updatedAt,
        });
        showToast({ kind: "ok", text: "동기화됨" });
      } else if (push.status === "conflict") {
        hydrateFromRemote(push.state, push.updatedAt);
        writePrefs({
          ...prefsRef.current,
          lastSyncedAt: push.updatedAt,
          localUpdatedAt: push.updatedAt,
        });
        showToast({
          kind: "ok",
          text: "동기화됨 · 서버의 최신 내용을 반영했습니다",
        });
      } else {
        showToast({ kind: "error", text: push.message });
      }
    } finally {
      syncInFlightRef.current = false;
      setBusy(false);
    }
  }, [hydrateFromRemote, showToast, skipRemotePushRef, writePrefs]);

  // Initial quiet pull on load / when sync first enabled
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    if (pulledOnceRef.current) return;
    pulledOnceRef.current = true;
    void runQuietRoundtrip({ pullOnly: true });
  }, [ready, prefs.enabled, prefs.code, runQuietRoundtrip]);

  useEffect(() => {
    if (!prefs.enabled) pulledOnceRef.current = false;
  }, [prefs.enabled]);

  // ~10 min quiet roundtrip while app is open
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void runQuietRoundtrip();
    }, AUTO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [ready, prefs.enabled, prefs.code, runQuietRoundtrip]);

  // Tab visible again after long hide → one quiet sync (no toast)
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt == null) return;
      if (Date.now() - hiddenAt < VISIBLE_RESYNC_AFTER_MS) return;
      void runQuietRoundtrip();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [ready, prefs.enabled, prefs.code, runQuietRoundtrip]);

  /** Connect flow: quiet pull with explicit code (no toast). */
  const runPull = useCallback(
    async (opts?: { code?: string }) => {
      await runQuietRoundtrip({
        code: opts?.code,
        pullOnly: Boolean(opts?.code),
      });
    },
    [runQuietRoundtrip],
  );

  return {
    prefs,
    writePrefs,
    busy,
    toast,
    showToast,
    syncNow,
    runPull,
  };
}
