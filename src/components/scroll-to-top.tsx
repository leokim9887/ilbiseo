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
 * Floating “맨 위로” — teal brand, above mobile tab bar.
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
        aria-label="맨 위로"
        title="맨 위로"
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        onClick={scrollTop}
        className={`scroll-to-top-btn flex size-12 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--sheet)_70%,var(--brand))] bg-[var(--brand)] text-[var(--primary-foreground)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--sheet)_82%,transparent),0_8px_24px_rgba(22,63,57,0.28)] outline-none touch-manipulation transition-[opacity,transform,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.45,0.64,1)] hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--sheet)_90%,transparent),0_10px_28px_rgba(22,63,57,0.34)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] active:scale-[0.94] sm:size-[3.15rem] dark:border-[color-mix(in_srgb,var(--brand)_45%,var(--sheet))] dark:shadow-[0_0_0_3px_rgba(26,34,30,0.65),0_8px_28px_rgba(0,0,0,0.45)] ${
          visible
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-90 opacity-0"
        }`}
      >
        <ChevronUp
          className="size-[1.35rem] sm:size-6"
          strokeWidth={2.4}
          aria-hidden
        />
      </button>
    </div>
  );
}

export const SCROLL_TO_TOP_THRESHOLD_PX = SHOW_AFTER_PX;
