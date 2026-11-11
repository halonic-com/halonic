import { useEffect, useRef } from "react";
import type { CloseStack } from "../close-stack/close-stack.ts";
import type { PhonePlaces } from "./use-phone-places.ts";

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
  const dialog = innermostOpenDialog();
  if (dialog !== undefined) {
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    return "handled";
  }
  if (closeStack.back()) {
    return "handled";
  }
  return goBack() ? "handled" : "leave";
}

/**
 * The open dialog the user sees on top. A dialog opened from another one (a phone `Select` picker
 * in a `FormSheet`) is nested in it, so it comes later in the page than the dialog under it.
 */
function innermostOpenDialog(): HTMLDialogElement | undefined {
  const open = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  return open[open.length - 1];
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
 * That step back does nothing when the Studio is the first page in its browser tab, and the
 * Studio stays without its entry. So every page move puts the entry back if it's missing;
 * otherwise the next back press would close the tab from wherever the user is.
 *
 * Only one entry is ever added, so the browser's history doesn't fill up as the user moves. When
 * the window widens to the desktop layout the entry stays and a back press there is ignored once:
 * taking it off from code would race with a remount.
 *
 * @example
 * usePhoneBackButton(presentation === "phone", shell.closeStack, places);
 */
export function usePhoneBackButton(
  enabled: boolean,
  closeStack: CloseStack,
  places: Pick<PhonePlaces, "stacks" | "back">,
): void {
  const { stacks, back } = places;
  const latestBack = useRef(back);
  useEffect(() => {
    latestBack.current = back;
  }, [back]);

  // Runs when the phone layout starts and after every page move.
  useEffect(() => {
    if (enabled && !isBackGuard(window.history.state)) {
      window.history.pushState(backGuard, "");
    }
  }, [enabled, stacks]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onPopState() {
      if (pressPhoneBack(closeStack, () => latestBack.current()) === "handled") {
        window.history.pushState(backGuard, "");
      } else {
        window.history.back();
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enabled, closeStack]);
}
