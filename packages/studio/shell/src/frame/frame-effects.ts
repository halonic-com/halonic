import { PHONE_MAX_WIDTH, type Presentation } from "@halonicjs/studio-kit";
import { useEffect, useSyncExternalStore } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { CloseStack } from "../close-stack/close-stack.ts";

/** The media query for the phone layout: narrower than `PHONE_MAX_WIDTH`. */
export const phoneQuery = `(width < ${PHONE_MAX_WIDTH}px)`;

/**
 * The window's presentation, from the width, following every change: a window narrowed below
 * `PHONE_MAX_WIDTH` gets the phone layout without a reload, and widened gets the desktop back.
 */
export function usePresentationFromWidth(): Presentation {
  const isPhone = useSyncExternalStore(subscribeToPhoneQuery, readPhoneQuery, () => false);
  return isPhone ? "phone" : "desktop";
}

function subscribeToPhoneQuery(onChange: () => void): () => void {
  const query = window.matchMedia(phoneQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readPhoneQuery(): boolean {
  return window.matchMedia(phoneQuery).matches;
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
 * Passes Esc to the close stack, which closes the topmost layer only. An open `<dialog>` handles
 * its own Esc as Cancel, so a press inside one is left to it: otherwise one Esc would close the
 * dialog and the layer under it. A press the stack used goes no further.
 */
export function useEscapeClosesTopLayer(closeStack: CloseStack): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || isInsideOpenDialog(event.target)) {
        return;
      }
      if (closeStack.escape({ isComposing: event.isComposing })) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeStack]);
}

function isInsideOpenDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("dialog[open]") !== null;
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
