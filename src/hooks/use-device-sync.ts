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

export function useDeviceSync({
  ready,
  state,
  localUpdatedAt,
  persistEpoch,
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
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const localUpdatedAtRef = useRef(localUpdatedAt);
  const prefsRef = useRef(prefs);
  const pulledOnceRef = useRef(false);

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

  const runPull = useCallback(
    async (opts?: { silent?: boolean; code?: string }) => {
      const current = prefsRef.current;
      const code = opts?.code ?? current.code;
      if (!code) return;
      if (!opts?.code && !current.enabled) return;
      setBusy(true);
      try {
        const result = await pullRemoteState(
          code,
          localUpdatedAtRef.current,
        );
        if (result.status === "applied") {
          hydrateFromRemote(result.state, result.updatedAt);
          const next = {
            ...prefsRef.current,
            lastSyncedAt: result.updatedAt,
            localUpdatedAt: result.updatedAt,
          };
          writePrefs(next);
          if (!opts?.silent) {
            showToast({ kind: "ok", text: "동기화됨 · 다른 기기 내용을 가져왔습니다" });
          } else {
            showToast({ kind: "ok", text: "동기화됨" });
          }
        } else if (result.status === "empty") {
          // First device: push local workbook up.
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
            showToast({ kind: "ok", text: "동기화됨 · 이 기기 내용을 올렸습니다" });
          } else if (push.status === "error") {
            showToast({ kind: "error", text: push.message });
          }
        } else if (result.status === "same" || result.status === "skipped-local-newer") {
          if (!opts?.silent) {
            showToast({ kind: "ok", text: "동기화됨" });
          }
        } else if (result.status === "error") {
          showToast({ kind: "error", text: result.message });
        }
      } finally {
        setBusy(false);
      }
    },
    [hydrateFromRemote, showToast, writePrefs],
  );

  const runPush = useCallback(
    async (opts?: { silent?: boolean }) => {
      const current = prefsRef.current;
      if (!current.enabled || !current.code) return;
      if (skipRemotePushRef.current) {
        skipRemotePushRef.current = false;
        return;
      }
      setBusy(true);
      try {
        const updatedAt =
          localUpdatedAtRef.current ?? new Date().toISOString();
        const result = await pushLocalState(
          current.code,
          stateRef.current,
          updatedAt,
        );
        if (result.status === "ok") {
          writePrefs({
            ...prefsRef.current,
            lastSyncedAt: result.updatedAt,
            localUpdatedAt: result.updatedAt,
          });
          if (!opts?.silent) {
            showToast({ kind: "ok", text: "동기화됨" });
          } else {
            showToast({ kind: "ok", text: "동기화됨" });
          }
        } else if (result.status === "conflict") {
          hydrateFromRemote(result.state, result.updatedAt);
          writePrefs({
            ...prefsRef.current,
            lastSyncedAt: result.updatedAt,
            localUpdatedAt: result.updatedAt,
          });
          showToast({
            kind: "info",
            text: "동기화됨 · 서버의 최신 내용을 반영했습니다",
          });
        } else {
          showToast({ kind: "error", text: result.message });
        }
      } finally {
        setBusy(false);
      }
    },
    [hydrateFromRemote, showToast, skipRemotePushRef, writePrefs],
  );

  const syncNow = useCallback(async () => {
    const current = prefsRef.current;
    if (!current.enabled || !current.code) {
      showToast({
        kind: "info",
        text: "먼저 동기화를 켜고 코드를 입력하세요",
      });
      return;
    }
    // Pull first (may apply remote), then push if local is still newer / empty handled in pull.
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
        showToast({ kind: "ok", text: "동기화됨" });
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
        showToast({ kind: "ok", text: "동기화됨" });
      } else {
        showToast({ kind: "error", text: push.message });
      }
    } finally {
      setBusy(false);
    }
  }, [hydrateFromRemote, showToast, writePrefs]);

  // Initial pull when sync is enabled
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    if (pulledOnceRef.current) return;
    pulledOnceRef.current = true;
    void runPull({ silent: true });
  }, [ready, prefs.enabled, prefs.code, runPull]);

  // Debounced push after local saves
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    if (persistEpoch === 0) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void runPush({ silent: true });
    }, 900);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [persistEpoch, ready, prefs.enabled, prefs.code, runPush]);

  // Re-pull when tab becomes visible
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void runPull({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ready, prefs.enabled, prefs.code, runPull]);

  return {
    prefs,
    writePrefs,
    busy,
    toast,
    showToast,
    syncNow,
    runPull,
    runPush,
  };
}
