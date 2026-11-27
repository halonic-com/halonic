import { useEffect, useRef } from "react";

/** The header's up and down steps: each opens the row before or after the open one, or is absent. */
export interface ItemSteps {
  readonly up?: (() => void) | undefined;
  readonly down?: (() => void) | undefined;
}

/**
 * The key of the row `by` places from `open` in `order`, the rows that wait in list order;
 * `undefined` past either end or when `open` doesn't wait.
 */
export function stepKey(
  order: readonly { readonly key: string }[],
  open: string | undefined,
  by: 1 | -1,
): string | undefined {
  const index = order.findIndex((row) => row.key === open);
  if (index === -1) return undefined;
  return order[index + by]?.key;
}

/** J or K with no modifier, not typed into a field. */
function isStepKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return false;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select"))
  ) {
    return false;
  }
  return event.key === "j" || event.key === "k";
}

/**
 * The open item's up and down steps (note 2 of the HAL-19192 sketches, as the Messenger's chat
 * header): up opens the row that waits before it, down the one after, and K and J do the same while
 * the Inbox shows and no field has focus. A step past either end is absent, so its button is off.
 */
export function useItemSteps(
  order: readonly { readonly key: string }[],
  open: string | undefined,
  openKey: (key: string) => void,
): ItemSteps {
  const up = stepKey(order, open, -1);
  const down = stepKey(order, open, 1);
  // The listener is added once; it reads the newest steps through this ref.
  const steps = useRef({ up, down, openKey });
  steps.current = { up, down, openKey };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isStepKey(event)) return;
      const { up: before, down: after, openKey: openIt } = steps.current;
      const key = event.key === "k" ? before : after;
      if (key === undefined) return;
      event.preventDefault();
      openIt(key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return {
    up: up === undefined ? undefined : () => openKey(up),
    down: down === undefined ? undefined : () => openKey(down),
  };
}
