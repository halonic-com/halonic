import { type FocusEvent, useEffect, useRef } from "react";

/**
 * Keeps keyboard focus on the page when a read swaps what it shows (WCAG 2.4.3): when the
 * focused element inside the page is removed, such as Try again once the read lands, focus moves
 * to the page's h1 instead of falling to the body. Give the h1 `ref={heading}` and `tabIndex={-1}`,
 * and the page's `<main>` `onFocus={remember}`.
 */
export function useKeepFocus() {
  const heading = useRef<HTMLHeadingElement>(null);
  const lastFocused = useRef<Element | null>(null);
  const remember = (event: FocusEvent) => {
    lastFocused.current = event.target;
  };
  // After every render: React has already removed what this render dropped.
  useEffect(() => {
    const focused = lastFocused.current;
    if (focused === null || focused.isConnected) return;
    lastFocused.current = null;
    // Something else, such as a child's own focus move, already placed focus.
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    heading.current?.focus();
  });
  return { heading, remember };
}
