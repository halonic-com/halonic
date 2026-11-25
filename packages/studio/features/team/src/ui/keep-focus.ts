import { type FocusEvent, type RefObject, useEffect, useRef } from "react";

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

/**
 * Where focus goes when a page arrives (WCAG 2.4.3): `heading` for a page that just opened, or the
 * row that opened a page, by its `data-opens` key, for a page you came Back to.
 */
export type ArrivalFocus = { kind: "heading" } | { kind: "row"; opens: string };

/**
 * Moves focus once when the page arrives, since a page that replaces another leaves focus on the
 * body. A page that opened focuses its h1 at once: the h1 is there while it reads. Back waits until
 * the read lands (`busy` ends), so the pressed row is drawn again, and focuses the h1 if the row has
 * gone. Give the page's `<main>` `ref={page}`.
 */
export function useArrivalFocus(
  heading: RefObject<HTMLHeadingElement | null>,
  arrival: ArrivalFocus | undefined,
  busy: boolean,
) {
  const page = useRef<HTMLElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (arrival === undefined || done.current) return;
    if (arrival.kind === "row" && busy) return;
    done.current = true;
    const row = arrival.kind === "row" ? openerOf(page.current, arrival.opens) : undefined;
    (row ?? heading.current)?.focus();
  }, [arrival, busy, heading]);
  return page;
}

/** The button inside the row whose `data-opens` is `opens`, if it is still drawn. */
function openerOf(page: HTMLElement | null, opens: string): HTMLElement | undefined {
  const rows = page?.querySelectorAll<HTMLElement>("[data-opens]") ?? [];
  const row = [...rows].find((each) => each.dataset["opens"] === opens);
  return row?.querySelector<HTMLElement>("button") ?? undefined;
}
