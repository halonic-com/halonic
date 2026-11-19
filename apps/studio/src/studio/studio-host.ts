import { tauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform, StudioHost } from "@halonicjs/studio-shell";

/** The media query for a touchscreen as the main pointer, which a phone has and a desktop doesn't. */
export const phonePointerQuery = "(pointer: coarse)";

/**
 * Where this Studio runs (`studio.entry`): the desktop app when the page is in Tauri's webview,
 * else the Studio served to a browser, on a phone when the browser's main pointer is a
 * touchscreen. The Android app never loads this page, so a phone opening `halonic serve` is the
 * only phone. The pointer is used, not the width: a narrow desktop window stays `served` and can
 * still approve what a phone only views (HAL-10084).
 */
export function studioHost(page: object): StudioHost {
  if (tauriIpc(page) !== undefined) {
    return "desktop-app";
  }
  return hasPhonePointer(page) ? "phone" : "served";
}

/** Whether the page's window says its main pointer is a touchscreen; a page without `matchMedia` isn't. */
function hasPhonePointer(page: object): boolean {
  if (!("matchMedia" in page) || typeof page.matchMedia !== "function") {
    return false;
  }
  const query: MediaQueryList = page.matchMedia(phonePointerQuery);
  return query.matches;
}

/** Whether `Mod` means ⌘ or Ctrl here, read from the browser's user agent. */
export function keyboardPlatform(userAgent: string): KeyboardPlatform {
  if (userAgent.includes("Mac")) {
    return "macos";
  }
  if (userAgent.includes("Windows")) {
    return "windows";
  }
  return "linux";
}
