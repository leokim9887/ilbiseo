"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD_PX = 72;
const MAX_PULL_PX = 110;
const MOBILE_MQ = "(max-width: 639px)";

function isScrollableAncestor(el: Element | null): boolean {
  let node: Element | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    const canScroll =
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      (node as HTMLElement).scrollHeight > (node as HTMLElement).clientHeight + 2;
    if (canScroll && (node as HTMLElement).scrollTop > 0) {
      return true;
    }
    // Excel / table panes — never steal their vertical gesture
    if (
      node.classList.contains("excel-scroll-wrap") ||
      node.classList.contains("excel-wb") ||
      (node as HTMLElement).dataset?.ptrIgnore === "1"
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function pageScrollTop(): number {
  return (
    window.scrollY ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

export type PullToRefreshHandlers = {
  /** Soft refresh: reload local state / sync pull. Return true to also hard-reload. */
  onRefresh: () => void | Promise<boolean | void>;
};

/**
 * Native-ish pull-to-refresh for phone / narrow viewports.
 * Activates only at page top; ignores gestures that start inside scrollable tables.
 */
export function usePullToRefresh({ onRefresh }: PullToRefreshHandlers) {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullingRef = useRef(false);
  const startYRef = useRef(0);
  const armedRef = useRef(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const reset = useCallback(() => {
    pullingRef.current = false;
    armedRef.current = false;
    startYRef.current = 0;
    setPullPx(0);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isMobile = () => window.matchMedia(MOBILE_MQ).matches;

    const onTouchStart = (e: TouchEvent) => {
      if (!isMobile() || refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      if (pageScrollTop() > 2) return;
      const target = e.target as Element | null;
      if (target && isScrollableAncestor(target)) return;
      pullingRef.current = true;
      armedRef.current = false;
      startYRef.current = e.touches[0].clientY;
      setPullPx(0);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;
      if (pageScrollTop() > 2) {
        reset();
        return;
      }
      const y = e.touches[0].clientY;
      const dy = y - startYRef.current;
      if (dy <= 0) {
        setPullPx(0);
        armedRef.current = false;
        return;
      }
      // Rubber-band ease
      const eased = Math.min(MAX_PULL_PX, dy * 0.55);
      setPullPx(eased);
      armedRef.current = eased >= THRESHOLD_PX;
      if (eased > 8 && e.cancelable) {
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      const shouldRefresh = armedRef.current && !refreshingRef.current;
      pullingRef.current = false;
      armedRef.current = false;
      if (!shouldRefresh) {
        setPullPx(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setPullPx(56);
      void (async () => {
        let hard = false;
        try {
          const result = await onRefreshRef.current();
          hard = result === true;
        } catch {
          /* soft fail — still finish gesture */
        }
        if (hard) {
          window.location.reload();
          return;
        }
        refreshingRef.current = false;
        setRefreshing(false);
        setPullPx(0);
      })();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [reset]);

  return { pullPx, refreshing, threshold: THRESHOLD_PX };
}
