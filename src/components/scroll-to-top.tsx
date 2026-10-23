"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

/** Show after this many px scrolled (~½–1 viewport on phones). */
const SHOW_AFTER_PX = 360;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Floating “맨 위로” — 일비서 teal glass (not Toss --brand, which flips pale in dark).
 * Appears past SHOW_AFTER_PX; one tap scrolls to top (instant if reduced motion).
 */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;

    const update = () => {
      const y =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      setVisible(y > SHOW_AFTER_PX);
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTop = () => {
    const behavior: ScrollBehavior = prefersReducedMotion()
      ? "auto"
      : "smooth";
    window.scrollTo({ top: 0, left: 0, behavior });
  };

  return (
    <div
      data-scroll-to-top-root
      className="pointer-events-none fixed z-[35] max-sm:bottom-[calc(5.85rem+env(safe-area-inset-bottom))] max-sm:right-[max(0.85rem,env(safe-area-inset-right))] sm:bottom-[max(1.35rem,env(safe-area-inset-bottom))] sm:right-[max(1.25rem,env(safe-area-inset-right))]"
    >
      <button
        type="button"
        data-scroll-to-top
        data-visible={visible ? "1" : "0"}
        aria-label="맨 위로"
        title="맨 위로"
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        onClick={scrollTop}
        className="scroll-to-top-btn"
      >
        <span className="scroll-to-top-sheen" aria-hidden />
        <ChevronUp className="scroll-to-top-icon" strokeWidth={3} aria-hidden />
      </button>
    </div>
  );
}

export const SCROLL_TO_TOP_THRESHOLD_PX = SHOW_AFTER_PX;
