import { useEffect, useRef } from "react";
import type { CloseStack } from "../close-stack/close-stack.ts";

/** What a back press did: it closed something or moved, or there was nowhere to go. */
export type PhoneBackResult = "handled" | "leave";

/**
 * One press of Android's back (or the browser's, served on a phone), in the order phone layout 2
 * gives: an open modal dialog cancels first, as its Cancel button would; then the close stack
 * closes its first layer (a sheet, a menu, a card); only with nothing open does the app go one
 * page back (`goBack`, which is `goBackOnPhone` on the place stacks). `goBack` returns `false` at
 * the top of Home, and then the press is `"leave"`: the Studio lets the system have it.
 *
 * A modal dialog isn't in the close stack: it handles Esc itself (see `useEscapeClosesTopLayer`).
 * Back reaches it the same way Esc does, as the dialog's `cancel` event.
 */
export function pressPhoneBack(closeStack: CloseStack, goBack: () => boolean): PhoneBackResult {
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  if (dialog !== null) {
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    return "handled";
  }
  if (closeStack.back()) {
    return "handled";
  }
  return goBack() ? "handled" : "leave";
}

/** The history entry the shell keeps on top while it handles back; see {@link usePhoneBackButton}. */
const backGuard = { halonicPhoneBack: true } as const;

function isBackGuard(state: unknown): boolean {
  return typeof state === "object" && state !== null && "halonicPhoneBack" in state;
}

/**
 * Hands Android's back to {@link pressPhoneBack} while `enabled` (the phone layout). The system
 * back arrives in the web view as a step back in the page's history, so the shell keeps one entry
 * of its own on top: a back press takes it off and fires `popstate`, and the shell handles the
 * press and puts the entry back. At the top of Home it doesn't put it back but steps back once
 * more, so the browser leaves the Studio, and in the app the next press is the system's own.
 *
 * Only one entry is ever added, so the browser's history doesn't fill up as the user moves. When
 * the window widens to the desktop layout the entry stays and a back press there is ignored once:
 * taking it off from code would race with a remount.
 *
 * @example
 * usePhoneBackButton(presentation === "phone", shell.closeStack, places.back);
 */
export function usePhoneBackButton(
  enabled: boolean,
  closeStack: CloseStack,
  goBack: () => boolean,
): void {
  const latestGoBack = useRef(goBack);
  useEffect(() => {
    latestGoBack.current = goBack;
  }, [goBack]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!isBackGuard(window.history.state)) {
      window.history.pushState(backGuard, "");
    }
    function onPopState() {
      if (pressPhoneBack(closeStack, () => latestGoBack.current()) === "handled") {
        window.history.pushState(backGuard, "");
      } else {
        window.history.back();
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enabled, closeStack]);
}
