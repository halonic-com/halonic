import { runStanding } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { type RefObject, useEffect, useRef } from "react";
import type { SourcedRun } from "../api.ts";
import { runAnnouncementKey, runChangeText } from "./run-change.ts";
import type { RunPageContext } from "./run-page-model.ts";

/**
 * What the run page does when the open run's status changes: reads the new state (A1) and, when
 * the change took the focused element, moves focus to the page's `h1` (A2). Gives the ref for the
 * page's element.
 */
export function useRunChanges(
  run: SourcedRun | undefined,
  log: readonly RunEvent[] | undefined,
  contextFor: (run: SourcedRun) => RunPageContext,
  announceState: ((key: string, text: string) => void) | undefined,
): RefObject<HTMLDivElement | null> {
  const text = run === undefined ? undefined : runChangeText(run, log, contextFor(run));
  useAnnounceRunChanges(run?.summary.id, text, announceState);
  const page = useRef<HTMLDivElement>(null);
  const status = run === undefined ? "" : `${run.summary.status}:${runStanding(run.summary)}`;
  useFocusHeadingWhenFocusGoes(page, status);
  return page;
}

/**
 * Reads the run's new state to a screen reader when it changes (a11y check A1): the first state
 * the page shows isn't a change, and neither is the page moving on to another run. A sentence that
 * can't be said yet (`undefined`) keeps the last one, so it is read once it can be.
 */
function useAnnounceRunChanges(
  runId: string | undefined,
  text: string | undefined,
  announceState: ((key: string, text: string) => void) | undefined,
): void {
  const said = useRef<{ readonly runId: string; readonly text: string } | undefined>(undefined);
  useEffect(() => {
    if (runId === undefined || text === undefined) {
      return;
    }
    const before = said.current;
    said.current = { runId, text };
    if (before !== undefined && before.runId === runId && before.text !== text) {
      announceState?.(runAnnouncementKey(runId), text);
    }
  }, [runId, text, announceState]);
}

/**
 * Moves focus to the page's `h1` when the run's status changed and took the focused element with
 * it, such as **Review in Inbox** in a banner that goes once the run finishes (a11y check A2).
 * Focus that is somewhere else, in the page or outside it, stays where it is.
 */
function useFocusHeadingWhenFocusGoes(page: RefObject<HTMLElement | null>, status: string): void {
  // The element in the page that last had focus; `null` once focus went outside the page.
  const lastFocused = useRef<Element | null>(null);
  useEffect(() => {
    // The shell may have put focus on the page's `h1` before this listens.
    const focused = document.activeElement;
    lastFocused.current =
      focused !== null && page.current?.contains(focused) === true ? focused : null;
    const note = (event: FocusEvent) => {
      const { target } = event;
      lastFocused.current =
        target instanceof Element && page.current?.contains(target) === true ? target : null;
    };
    document.addEventListener("focusin", note);
    return () => document.removeEventListener("focusin", note);
  }, [page]);
  useEffect(() => {
    const gone = lastFocused.current;
    const focused = document.activeElement;
    if (gone === null || gone.isConnected || (focused !== null && focused !== document.body)) {
      return;
    }
    const heading = page.current?.querySelector<HTMLElement>("h1");
    if (heading == null) {
      return;
    }
    // Focusable from code, never a Tab stop; the page keeps its scroll.
    if (!heading.hasAttribute("tabindex")) {
      heading.tabIndex = -1;
    }
    heading.focus({ preventScroll: true });
  }, [page, status]);
}
