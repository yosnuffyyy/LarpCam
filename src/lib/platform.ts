/** Small facts about where the app is running. All feature-detected. */

/** True when launched from the Home Screen (or installed on desktop). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** iPhone or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Safari itself, not an in-app browser or another iOS browser shell. */
export function isIOSSafari(): boolean {
  return isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//.test(navigator.userAgent);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A key unique to this copy of the app. The live site and pull-request
 * previews share one web address, so storage is kept apart by folder.
 */
export function storageNamespace(): string {
  const path = new URL('.', document.baseURI).pathname;
  return `larpcam:${path}`;
}

/** A short buzz on phones that support it. iPhones do not, so this is silent there. */
export function tick(ms = 10): void {
  if (typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms);
    } catch {
      /* not allowed right now; nothing to do */
    }
  }
}
