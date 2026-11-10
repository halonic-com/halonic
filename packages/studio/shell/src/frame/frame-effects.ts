import {
  isComposing,
  PHONE_MAX_WIDTH,
  type Presentation,
  WIDE_MIN_WIDTH,
} from "@halonicjs/studio-kit";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { CloseStack } from "../close-stack/close-stack.ts";

/** The media query for the phone layout: narrower than `PHONE_MAX_WIDTH`. */
export const phoneQuery = `(width < ${PHONE_MAX_WIDTH}px)`;

/**
 * The window's presentation, from the width, following every change: a window narrowed below
 * `PHONE_MAX_WIDTH` gets the phone layout without a reload, and widened gets the desktop back.
 */
export function usePresentationFromWidth(): Presentation {
  return useMediaQuery(phoneQuery) ? "phone" : "desktop";
}

/** The media query for the narrow window and the phone: narrower than `WIDE_MIN_WIDTH`. */
export const narrowQuery = `(width < ${WIDE_MIN_WIDTH}px)`;

/**
 * Whether the desktop window is narrow (600 to 899px), following every change. There the sidebar
 * folds into the Places drawer and has no resize edge (component specs 24.4). Always false on a
 * phone, which has its own layout.
 */
export function useNarrowWindow(): boolean {
  const narrow = useMediaQuery(narrowQuery);
  const presentation = usePresentationFromWidth();
  return narrow && presentation === "desktop";
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Sets `<html lang>`. The Tabs hyphenate their labels with `hyphens: auto`, which only works when
 * the browser knows the language (kit design check C6, HAL-1560).
 */
export function useDocumentLanguage(language: string): void {
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
}

/**
 * Passes Esc to the close stack, which closes the topmost layer only. While a modal `<dialog>` is
 * open it handles Esc itself as Cancel, wherever focus is (even on `body`), so the frame leaves
 * every press to it: otherwise one Esc would close the dialog and the layer under it. A press the
 * stack used is marked handled with `preventDefault()`, so nothing after it acts on it again.
 */
export function useEscapeClosesTopLayer(closeStack: CloseStack): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || isModalDialogOpen()) {
        return;
      }
      if (closeStack.escape({ isComposing: isComposing(event) })) {
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeStack]);
}

/**
 * Whether a modal dialog is open. The kit's Dialog is the Studio's only `<dialog>`, and it always
 * opens with `showModal()`, so any open one is modal. (`:modal` would say so directly, but jsdom
 * doesn't know it.)
 */
function isModalDialogOpen(): boolean {
  return document.querySelector("dialog[open]") !== null;
}

/**
 * Tells the announcer whether the window has focus, so an announcement made while the user was in
 * the browser (a sign-in) waits until they come back.
 */
export function useWindowFocusForAnnouncer(announcer: Announcer): void {
  useEffect(() => {
    const focused = () => announcer.setWindowFocused(true);
    const blurred = () => announcer.setWindowFocused(false);
    announcer.setWindowFocused(document.hasFocus());
    window.addEventListener("focus", focused);
    window.addEventListener("blur", blurred);
    return () => {
      window.removeEventListener("focus", focused);
      window.removeEventListener("blur", blurred);
    };
  }, [announcer]);
}
