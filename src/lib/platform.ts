/**
 * Client-side platform helpers (Safari / PWA / Android).
 * Keep UA checks centralized so UI gates stay consistent.
 */

/** iPhone / iPad / iPod — incl. iPadOS desktop-mode UA via maxTouchPoints. */
export function isAppleMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ may report as Mac
  return (
    /Macintosh/i.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

export function isSamsungInternet(): boolean {
  if (typeof navigator === "undefined") return false;
  return /SamsungBrowser/i.test(navigator.userAgent || "");
}
