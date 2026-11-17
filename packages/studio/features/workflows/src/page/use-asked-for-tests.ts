import { useState } from "react";

/**
 * Calls `onAsked` during the render in which an open page is asked for its Tests: `asked`, the
 * number of times the tab was asked while Tests is wanted, becomes a number or changes. It is
 * `undefined` while Tests isn't wanted. Opening already asked (the first render) is not a new ask.
 */
export function useAskedForTests(asked: number | undefined, onAsked: () => void) {
  const [seen, setSeen] = useState(asked);
  if (asked === seen) return;
  setSeen(asked);
  if (asked !== undefined) onAsked();
}
