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
  const status = run === undefined ? "" : `${run.summary.status}:${runStanding(run.summary)}`;
  useAnnounceRunChanges(run?.summary.id, status, text, announceState);
  const page = useRef<HTMLDivElement>(null);
  useFocusHeadingWhenFocusGoes(page, status);
  return page;
}

/**
 * Reads the run's new state to a screen reader when its status changes (a11y check A1): the first
 * state the page shows isn't a change, and neither is the page moving on to another run. Only the
 * status counts, not the sentence, which also changes when nothing happened to the run ("until
 * tomorrow 14:00" becomes "until 14:00" at midnight, HAL-12820). A sentence that can't be said yet
 * (`undefined`) keeps the last status, so the change is read once it can be.
 */
function useAnnounceRunChanges(
  runId: string | undefined,
  status: string,
  text: string | undefined,
  announceState: ((key: string, text: string) => void) | undefined,
): void {
  const said = useRef<{ readonly runId: string; readonly status: string } | undefined>(undefined);
  useEffect(() => {
    if (runId === undefined || text === undefined) {
      return;
    }
    const before = said.current;
    said.current = { runId, status };
    if (before !== undefined && before.runId === runId && before.status !== status) {
      announceState?.(runAnnouncementKey(runId), text);
    }
  }, [runId, status, text, announceState]);
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
