import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

export interface ModalFocus {
  /** Where focus goes once the dialog is open. */
  readonly initial: () => HTMLElement | null;
  /** Where focus goes on close when the opener is gone or inert (component specs 23 A2). */
  readonly fallback?: (() => HTMLElement | null) | undefined;
}

/**
 * Opens `dialog` as a modal while the component is mounted, and closes it when it unmounts.
 * The element that had focus before is the opener: focus goes back to it on close, or, when it
 * has left the document, sits under `inert` or was only `body`, to `fallback()`, else to the
 * page's `h1`, which needs `tabIndex={-1}` to take focus. Older WebKitGTK doesn't move focus
 * back by itself, so the kit always does (component specs 8).
 */
export function useModal(dialog: RefObject<HTMLDialogElement | null>, focus: ModalFocus): void {
  const latest = useRef(focus);
  latest.current = focus;
  const opener = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    opener.current = openerOf(document.activeElement);
    element.showModal();
    latest.current.initial()?.focus();
    return () => element.close();
  }, [dialog]);

  // Focus moves back after the commit that removed the dialog, so the fallback can be an element
  // that same commit added, such as the Callout that says what was decided.
  useEffect(
    () => () => {
      focusTarget(opener.current, latest.current.fallback)?.focus();
    },
    [],
  );
}

/** With nothing focused, `activeElement` is `body` (or the root): that's no opener at all. */
function openerOf(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement)) {
    return null;
  }
  return active === document.body || active === document.documentElement ? null : active;
}

function focusTarget(
  opener: HTMLElement | null,
  fallback: (() => HTMLElement | null) | undefined,
): HTMLElement | null {
  if (opener?.isConnected === true && opener.closest("[inert]") === null) {
    return opener;
  }
  return fallback?.() ?? document.querySelector<HTMLElement>("h1");
}
