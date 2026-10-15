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

/**
 * PC↔폰 동기화 — 수동 우선.
 * - 페이지 로드 시 1회 pull(토스트 없음)
 * - 「지금 동기화」클릭 시에만 push/pull + 「동기화됨」토스트
 * - 편집·저장마다 자동 push / 탭 전환 auto-pull 없음
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

  /** Background / load pull — never shows 「동기화됨」 toast. */
  const runPull = useCallback(
    async (opts?: { code?: string }) => {
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
          writePrefs({
            ...prefsRef.current,
            lastSyncedAt: result.updatedAt,
            localUpdatedAt: result.updatedAt,
          });
        } else if (result.status === "empty") {
          // First device: quietly seed remote with local workbook.
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
        }
        // same / skipped-local-newer / error — silent on background pull
      } finally {
        setBusy(false);
      }
    },
    [hydrateFromRemote, writePrefs],
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
      setBusy(false);
    }
  }, [hydrateFromRemote, showToast, skipRemotePushRef, writePrefs]);

  // Initial pull on load / when sync first enabled — no toast
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    if (pulledOnceRef.current) return;
    pulledOnceRef.current = true;
    void runPull();
  }, [ready, prefs.enabled, prefs.code, runPull]);

  // Reset pulledOnce when sync turned off so next enable pulls again
  useEffect(() => {
    if (!prefs.enabled) pulledOnceRef.current = false;
  }, [prefs.enabled]);

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
