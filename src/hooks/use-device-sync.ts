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
import { mergeForSync } from "@/lib/sync-merge";

/** Background cadence while the app stays open (connected sync code). */
export const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;

/** Debounce local edits before push+merge roundtrip (not minutes). */
export const EDIT_PUSH_DEBOUNCE_MS = 2_000;

/** Short settle after focus / visibility / online before pull. */
const RESUME_PULL_DEBOUNCE_MS = 400;

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

type RoundtripOpts = {
  code?: string;
  /** Toast success/error (manual 「지금 동기화」). */
  loud?: boolean;
  /** Why this roundtrip ran (for quiet error surfacing). */
  reason?: "interval" | "edit" | "resume" | "connect" | "online" | "manual";
};

/**
 * PC↔폰 동기화 (reliable)
 * - Connect / focus / visibility / online → pull+merge promptly
 * - Local edits → debounced push (~2s)
 * - ~10분 quiet cadence kept as backup
 * - Entity-level merge (no blind whole-state wipe)
 * - 「지금 동기화」 success/error toasts; quiet failures also surfaced
 */
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
  const stateRef = useRef(state);
  const localUpdatedAtRef = useRef(localUpdatedAt);
  const prefsRef = useRef(prefs);
  const pulledOnceRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const pendingAfterInFlightRef = useRef(false);
  const lastErrorToastAtRef = useRef(0);

  stateRef.current = state;
  localUpdatedAtRef.current = localUpdatedAt;
  prefsRef.current = prefs;

  const showToast = useCallback((next: SyncToast) => {
    setToast(next);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (next) {
      const ms = next.kind === "error" ? 4500 : 3200;
      toastTimer.current = setTimeout(() => setToast(null), ms);
    }
  }, []);

  const showQuietError = useCallback(
    (message: string) => {
      const now = Date.now();
      // Avoid toast spam on rapid resume/edit retries.
      if (now - lastErrorToastAtRef.current < 8_000) return;
      lastErrorToastAtRef.current = now;
      showToast({
        kind: "error",
        text: message || "동기화에 실패했습니다. 잠시 후 「지금 동기화」를 눌러 주세요.",
      });
    },
    [showToast],
  );

  const writePrefs = useCallback((next: DeviceSyncPrefs) => {
    prefsRef.current = next;
    setPrefs(next);
    saveSyncPrefs(next);
  }, []);

  const pushMerged = useCallback(
    async (
      code: string,
      merged: AppState,
      updatedAt: string,
      loud: boolean,
    ): Promise<"ok" | "error" | "conflict-resolved"> => {
      const push = await pushLocalState(code, merged, updatedAt);
      if (push.status === "ok") {
        writePrefs({
          ...prefsRef.current,
          lastSyncedAt: push.updatedAt,
          localUpdatedAt: push.updatedAt,
        });
        return "ok";
      }
      if (push.status === "conflict") {
        // Server won the race — merge again with conflict payload and retry once.
        const again = mergeForSync({
          local: stateRef.current,
          remote: push.state,
          localUpdatedAt: localUpdatedAtRef.current,
          remoteUpdatedAt: push.updatedAt,
        });
        hydrateFromRemote(again.merged, again.mergedUpdatedAt);
        const retryAt = new Date(
          Math.max(Date.now(), Date.parse(push.updatedAt) + 1),
        ).toISOString();
        const retry = await pushLocalState(code, again.merged, retryAt);
        if (retry.status === "ok") {
          writePrefs({
            ...prefsRef.current,
            lastSyncedAt: retry.updatedAt,
            localUpdatedAt: retry.updatedAt,
          });
          return "conflict-resolved";
        }
        if (loud) {
          showToast({
            kind: "error",
            text: retry.status === "error" ? retry.message : "동기화 충돌을 풀지 못했습니다.",
          });
        } else {
          showQuietError(
            retry.status === "error" ? retry.message : "동기화 충돌을 풀지 못했습니다.",
          );
        }
        return "error";
      }
      if (loud) {
        showToast({ kind: "error", text: push.message });
      } else {
        showQuietError(push.message);
      }
      return "error";
    },
    [hydrateFromRemote, showQuietError, showToast, writePrefs],
  );

  /**
   * Pull → entity merge → hydrate → push when local contributed.
   */
  const runRoundtrip = useCallback(
    async (opts?: RoundtripOpts) => {
      const current = prefsRef.current;
      const code = opts?.code ?? current.code;
      const loud = Boolean(opts?.loud);
      if (!code) return;
      if (!opts?.code && !current.enabled) return;

      if (skipRemotePushRef.current) {
        skipRemotePushRef.current = false;
      }

      if (syncInFlightRef.current) {
        pendingAfterInFlightRef.current = true;
        if (loud) {
          showToast({ kind: "info", text: "동기화 중입니다. 잠시만요." });
        }
        return;
      }

      syncInFlightRef.current = true;
      setBusy(true);
      try {
        const pull = await pullRemoteState(code, localUpdatedAtRef.current);

        if (pull.status === "error") {
          if (loud) showToast({ kind: "error", text: pull.message });
          else showQuietError(pull.message);
          return;
        }

        if (pull.status === "empty") {
          const updatedAt =
            localUpdatedAtRef.current ?? new Date().toISOString();
          const result = await pushMerged(
            code,
            stateRef.current,
            updatedAt,
            loud,
          );
          if (loud && result === "ok") {
            showToast({ kind: "ok", text: "동기화됨 · 이 기기 내용을 올렸습니다" });
          }
          return;
        }

        if (pull.status === "same") {
          // Local may still be ahead if clocks matched after a prior sync but
          // persist bumped localUpdatedAt incorrectly — check and push if needed.
          const localT = localUpdatedAtRef.current
            ? Date.parse(localUpdatedAtRef.current)
            : 0;
          const remoteT = Date.parse(pull.updatedAt);
          if (localT > remoteT) {
            const result = await pushMerged(
              code,
              stateRef.current,
              localUpdatedAtRef.current!,
              loud,
            );
            if (loud && (result === "ok" || result === "conflict-resolved")) {
              showToast({ kind: "ok", text: "동기화됨" });
            }
            return;
          }
          writePrefs({
            ...prefsRef.current,
            lastSyncedAt: pull.updatedAt,
            localUpdatedAt: pull.updatedAt,
          });
          if (loud) {
            showToast({ kind: "ok", text: "이미 최신입니다" });
          }
          return;
        }

        // pull.status === "remote"
        const { merged, mergedUpdatedAt, shouldPush } = mergeForSync({
          local: stateRef.current,
          remote: pull.state,
          localUpdatedAt: localUpdatedAtRef.current,
          remoteUpdatedAt: pull.updatedAt,
        });

        hydrateFromRemote(merged, shouldPush ? mergedUpdatedAt : pull.updatedAt);

        if (shouldPush) {
          const result = await pushMerged(
            code,
            merged,
            mergedUpdatedAt,
            loud,
          );
          if (loud && (result === "ok" || result === "conflict-resolved")) {
            showToast({
              kind: "ok",
              text: "동기화됨 · 양쪽 내용을 합쳤습니다",
            });
          }
        } else {
          writePrefs({
            ...prefsRef.current,
            lastSyncedAt: pull.updatedAt,
            localUpdatedAt: pull.updatedAt,
          });
          if (loud) {
            showToast({
              kind: "ok",
              text: "동기화됨 · 다른 기기 내용을 가져왔습니다",
            });
          }
        }
      } finally {
        syncInFlightRef.current = false;
        setBusy(false);
        if (pendingAfterInFlightRef.current) {
          pendingAfterInFlightRef.current = false;
          // Coalesce bursts (typing + visibility) into one follow-up.
          window.setTimeout(() => {
            void runRoundtrip({ reason: "edit" });
          }, EDIT_PUSH_DEBOUNCE_MS);
        }
      }
    },
    [
      hydrateFromRemote,
      pushMerged,
      showQuietError,
      showToast,
      skipRemotePushRef,
      writePrefs,
    ],
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
    await runRoundtrip({ loud: true, reason: "manual" });
  }, [runRoundtrip, showToast]);

  // Initial pull+merge+push on load / when sync first enabled
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    if (pulledOnceRef.current) return;
    pulledOnceRef.current = true;
    void runRoundtrip({ reason: "connect" });
  }, [ready, prefs.enabled, prefs.code, runRoundtrip]);

  useEffect(() => {
    if (!prefs.enabled) pulledOnceRef.current = false;
  }, [prefs.enabled]);

  // Local edits → debounced roundtrip (not minutes of lag)
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    if (persistEpoch <= 0) return;
    if (skipRemotePushRef.current) {
      skipRemotePushRef.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      void runRoundtrip({ reason: "edit" });
    }, EDIT_PUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [
    persistEpoch,
    ready,
    prefs.enabled,
    prefs.code,
    runRoundtrip,
    skipRemotePushRef,
  ]);

  // ~10 min quiet cadence while visible (backup, not sole path)
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void runRoundtrip({ reason: "interval" });
    }, AUTO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [ready, prefs.enabled, prefs.code, runRoundtrip]);

  // Focus / visibility / online → prompt pull+merge
  useEffect(() => {
    if (!ready || !prefs.enabled || !prefs.code) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (reason: RoundtripOpts["reason"]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void runRoundtrip({ reason });
      }, RESUME_PULL_DEBOUNCE_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule("resume");
    };
    const onFocus = () => schedule("resume");
    const onOnline = () => schedule("online");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [ready, prefs.enabled, prefs.code, runRoundtrip]);

  /** Connect flow: full roundtrip with explicit code. */
  const runPull = useCallback(
    async (opts?: { code?: string }) => {
      await runRoundtrip({
        code: opts?.code,
        reason: "connect",
      });
    },
    [runRoundtrip],
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
