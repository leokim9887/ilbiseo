"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Dev (`next dev`): unregister so HMR is not blocked.
    // Production build (`next start` / Vercel): register for install + offline shell.
    if (process.env.NODE_ENV === "development") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => void r.unregister());
      });
      return;
    }

    let refreshing = false;
    const onControllerChange = () => {
      // New SW took control — reload once so phone gets latest CSS/layout
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    const promptWaiting = (reg: ServiceWorkerRegistration) => {
      const waiting = reg.waiting;
      if (!waiting) return;
      waiting.postMessage({ type: "SKIP_WAITING" });
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          promptWaiting(reg);
          // Check for a newer SW soon after open (PWA may stay open for days)
          void reg.update();
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed") promptWaiting(reg);
            });
          });
        })
        .catch((err) => {
          console.warn("일비서 SW 등록 실패", err);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    // Periodic update check while the installed app stays open
    const interval = window.setInterval(() => {
      void navigator.serviceWorker.getRegistration().then((reg) => {
        void reg?.update();
        if (reg) promptWaiting(reg);
      });
    }, 60_000);

    return () => {
      window.clearInterval(interval);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  return null;
}
