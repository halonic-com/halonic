import { useCallback, useLayoutEffect, useState } from "react";
import type { TabSet } from "./tab-set.ts";

/** Back and Forward through the active tab's history, as {@link useHistoryMoves} gives them. */
export interface HistoryMoves {
  /** Goes one place back; when it went, focus moves to the new page's `h1`. */
  readonly back: () => void;
  /** Goes one place forward; when it went, focus moves to the new page's `h1`. */
  readonly forward: () => void;
}

/**
 * Back and Forward for the active tab that take focus to the page they reach (UX checklist 1.12,
 * a11y A3): after the move the old page is gone, so focus goes to the new page's `h1`, and a
 * screen reader reads where the user is now. With nowhere to go nothing moves and focus stays.
 * The toolbar's buttons use it, and so do Alt ← and Alt → (3c), so both move focus the same way.
 */
export function useHistoryMoves(tabs: TabSet): HistoryMoves {
  const focusNewPage = usePageHeadingFocus();
  const move = useCallback(
    (went: boolean) => {
      if (went) {
        focusNewPage();
      }
    },
    [focusNewPage],
  );
  const back = useCallback(() => move(tabs.back()), [tabs, move]);
  const forward = useCallback(() => move(tabs.forward()), [tabs, move]);
  return { back, forward };
}

/**
 * Gives a function that moves focus to the page's `h1` once the page the user just went to is
 * drawn (a11y A3): call it right after changing the tabs, and the focus follows the next commit.
 * Focus moved from code after a key shows the ring, and after a click it doesn't.
 */
export function usePageHeadingFocus(): () => void {
  // Counts the requests, so the effect runs after the commit that shows the new page.
  const [requests, setRequests] = useState(0);
  useLayoutEffect(() => {
    if (requests > 0) {
      focusPageHeading();
    }
  }, [requests]);
  return useCallback(() => setRequests((count) => count + 1), []);
}

/**
 * Moves focus to the page's `h1`, the first one in `main` that is shown: the pages of other tabs
 * stay mounted but hidden (`TabPages`), and their headings don't count. A heading isn't focusable
 * by itself, so it gets `tabindex="-1"` when it has none: focusable from code, never a Tab stop.
 *
 * A page whose view is still loading has no `h1` yet (a place's view is imported when a tab first
 * shows it), so the focus waits for it and moves when the view draws its `h1`. It stops waiting
 * when the focus moves somewhere else first, or when the next call asks for another page.
 */
export function focusPageHeading(root: ParentNode = document): void {
  stopWaiting?.();
  stopWaiting = undefined;
  const heading = shownPageHeading(root);
  if (heading !== undefined) {
    focusHeading(heading);
    return;
  }
  const focusBefore = document.activeElement;
  const watched = root instanceof Document ? (root.querySelector("main") ?? root.body) : root;
  const observer = new MutationObserver(() => {
    const active = document.activeElement;
    if (active !== focusBefore && active !== document.body && active !== null) {
      stop();
      return;
    }
    const drawn = shownPageHeading(root);
    if (drawn !== undefined) {
      stop();
      focusHeading(drawn);
    }
  });
  const stop = () => {
    observer.disconnect();
    if (stopWaiting === stop) {
      stopWaiting = undefined;
    }
  };
  observer.observe(watched, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  stopWaiting = stop;
}

/** Stops the focus that waits for a page's `h1` still loading; one page waits at a time. */
let stopWaiting: (() => void) | undefined;

function shownPageHeading(root: ParentNode): HTMLHeadingElement | undefined {
  const headings = root.querySelectorAll<HTMLHeadingElement>("main h1");
  return [...headings].find((candidate) => candidate.closest("[hidden]") === null);
}

function focusHeading(heading: HTMLHeadingElement): void {
  if (!heading.hasAttribute("tabindex")) {
    heading.tabIndex = -1;
  }
  heading.focus();
}
