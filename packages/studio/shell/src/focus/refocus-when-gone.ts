import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Whether nothing has the focus, as when the focused control left the page. */
export function focusFellToPage(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}

/**
 * For a control that goes away while it may hold the focus, as a Try again does once a read works:
 * after the draw that removed it, `refocus` moves the focus, but only if the control held it as it
 * went and the focus fell to the page with it. Whatever removed the control, a press or a change
 * nobody asked for, counts the same. Hand the returned function to {@link useTellWhenGoneWithFocus}
 * in the component that holds the control.
 *
 * @example
 * const tryAgainGone = useRefocusWhenGone(() => newChat.current?.focus());
 * // in the line: useTellWhenGoneWithFocus(tryAgain, tryAgainGone);
 */
export function useRefocusWhenGone(refocus: () => void): () => void {
  const goneWithFocus = useRef(false);
  const latest = useRef(refocus);
  latest.current = refocus;
  // Runs after every draw, to catch the one that removed the control.
  useEffect(() => {
    if (!goneWithFocus.current) return;
    goneWithFocus.current = false;
    if (focusFellToPage()) latest.current();
  });
  return useCallback(() => {
    goneWithFocus.current = true;
  }, []);
}

/**
 * Calls `onGoneWithFocus` when the calling component goes while `control` holds the focus. React
 * runs a layout effect's cleanup before it removes the component's elements, so the control still
 * holds the focus then.
 */
export function useTellWhenGoneWithFocus(
  control: RefObject<HTMLElement | null>,
  onGoneWithFocus: () => void,
): void {
  const latest = useRef(onGoneWithFocus);
  latest.current = onGoneWithFocus;
  useLayoutEffect(() => {
    const element = control.current;
    return () => {
      if (element !== null && element === document.activeElement) latest.current();
    };
  }, [control]);
}
