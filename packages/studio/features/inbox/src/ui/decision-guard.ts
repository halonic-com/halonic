import { type KeyboardEvent, type PointerEvent, useCallback, useRef } from "react";

/** How long the bar ignores presses after the card becomes usable (flow-inbox 3.3, a11y 8.3). */
export const guardMs = 1000;

/** What the decision bar attaches, and asks before it acts on a click. */
export interface DecisionGuard {
  readonly onPointerDownCapture: (event: PointerEvent) => void;
  readonly onKeyDownCapture: (event: KeyboardEvent) => void;
  /** True when the click that just came may decide; false for one the guard holds back. */
  allows(): boolean;
}

/**
 * The 1 s guard on the decision bar (`inbox.approval-card`): a pointer or touch press that
 * started in the first second after the card became usable does nothing, and neither does a key
 * that is held or repeats. A screen reader's click, which comes with no press before it, goes
 * through. Nothing on screen changes: the buttons stay as they are and keep focus.
 *
 * @param usableAt when the card became usable, in `now()` time; a new value starts a new second
 */
export function useDecisionGuard(usableAt: number, now: () => number = Date.now): DecisionGuard {
  const press = useRef<{ at: number; repeat: boolean } | null>(null);
  const onPointerDownCapture = useCallback(() => {
    press.current = { at: now(), repeat: false };
  }, [now]);
  const onKeyDownCapture = useCallback(
    (event: KeyboardEvent) => {
      // A repeat keeps the time of the first press, so a key held since before still counts as early.
      const first = event.repeat && press.current !== null ? press.current.at : now();
      press.current = { at: first, repeat: event.repeat };
    },
    [now],
  );
  return {
    onPointerDownCapture,
    onKeyDownCapture,
    allows: () => {
      const last = press.current;
      press.current = null;
      if (last === null) return true;
      return !last.repeat && last.at >= usableAt + guardMs;
    },
  };
}
