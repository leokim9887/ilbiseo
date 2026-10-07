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

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Pick up new SW (cache bump) without waiting forever
          if (reg.waiting) reg.waiting.postMessage?.({ type: "SKIP_WAITING" });
        })
        .catch((err) => {
          console.warn("일비서 SW 등록 실패", err);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
